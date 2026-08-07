/**
 * lib/github/dependency-reader.ts
 *
 * Reads every package.json in a repo and returns a flat list of declared
 * dependencies. This is the generic counterpart to repo-scanner.ts: where
 * that file looks specifically for Stripe usage, this one is dependency-
 * agnostic and feeds the `repo_dependencies` table.
 *
 * Deliberately narrow scope:
 *  - Reads declared ranges from package.json only. It does NOT read lockfiles,
 *    so `resolved_version` is left null for the caller to fill in later.
 *  - Does NOT hit the npm registry. Pure GitHub reads. Registry lookups are
 *    lib/registry/npm-client.ts's job, kept separate so each is testable alone.
 *  - Does NOT write to the database. The caller owns persistence.
 */

import { getInstallationOctokit } from "@/lib/github/app-auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard cap on package.json files read per repo. Large monorepos can contain
 * hundreds; beyond this we stop and flag the result as truncated rather than
 * burning the installation's hourly API budget.
 */
const MAX_MANIFESTS_PER_REPO = 100;

/**
 * Dependency sections we read. `peerDependencies` and `optionalDependencies`
 * are intentionally excluded — they describe what a package expects of its
 * consumers, not what this repo actually installs and calls.
 */
const DEP_SECTIONS = ["dependencies", "devDependencies"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeclaredDependency {
  /** Package name exactly as written, e.g. "react" or "@stripe/stripe-js". */
  packageName: string;
  /** The raw range from package.json, e.g. "^18.2.0". Never normalised here. */
  declaredRange: string;
  /**
   * Resolved/installed version. Always null from this module — we do not read
   * lockfiles. Present so the shape matches the repo_dependencies table.
   */
  resolvedVersion: string | null;
  /** Which package.json declared it, e.g. "packages/api/package.json". */
  manifestPath: string;
  /** Which section it came from. */
  section: "dependencies" | "devDependencies";
  /** Ecosystem tag matching the repo_dependencies CHECK constraint. */
  ecosystem: "npm";
}

export interface DependencyReadResult {
  /** Flat list across every manifest found. May contain the same package
   *  name more than once if several workspaces declare it. */
  dependencies: DeclaredDependency[];
  /** Paths of the package.json files actually read. */
  manifestPaths: string[];
  /** True if the repo had more manifests than MAX_MANIFESTS_PER_REPO. */
  truncated: boolean;
  /** Manifests found but unreadable (bad JSON, fetch failure), with reasons. */
  skipped: Array<{ path: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Fetches one file's decoded UTF-8 content via the contents API. */
async function fetchFileContent(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
    throw new Error(`Expected a file at ${path}, got something else`);
  }

  return Buffer.from(data.content, "base64").toString("utf8");
}

/**
 * True for package.json files we care about. Excludes anything inside
 * node_modules — vendored dependency manifests are not this repo's
 * declared deps and would produce thousands of false rows.
 */
function isRelevantManifest(path: string): boolean {
  if (!path.endsWith("package.json")) return false;
  if (path.split("/").includes("node_modules")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads all declared npm dependencies for `owner/repo` at `branch`.
 *
 * Failure behaviour is deliberate: an unreadable or malformed package.json is
 * recorded in `skipped` and the read continues. A repo with one broken
 * manifest still yields useful data for the rest. Only a failure to fetch the
 * git tree itself throws, since without it there is nothing to report.
 */
export async function readRepoDependencies(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
): Promise<DependencyReadResult> {
  const octokit = await getInstallationOctokit(installationId);

  // ── Step 1: Full recursive tree (one API call) ────────────────────────────
  console.log(`[dep-reader] Fetching tree for ${owner}/${repo}@${branch} ...`);

  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  const allManifests = (tree.tree ?? []).filter(
    (entry) => entry.type === "blob" && entry.path && isRelevantManifest(entry.path),
  );

  const truncated = allManifests.length > MAX_MANIFESTS_PER_REPO;
  const manifests = allManifests.slice(0, MAX_MANIFESTS_PER_REPO);

  if (truncated) {
    console.warn(
      `[dep-reader] ${allManifests.length} manifests found — reading first ${MAX_MANIFESTS_PER_REPO} only`,
    );
  }

  console.log(`[dep-reader] Reading ${manifests.length} package.json file(s) ...`);

  // ── Step 2: Read and parse each manifest ──────────────────────────────────
  const dependencies: DeclaredDependency[] = [];
  const manifestPaths: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const entry of manifests) {
    const path = entry.path!;

    let raw: string;
    try {
      raw = await fetchFileContent(octokit, owner, repo, path, branch);
    } catch (err) {
      skipped.push({
        path,
        reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      skipped.push({
        path,
        reason: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    manifestPaths.push(path);

    for (const section of DEP_SECTIONS) {
      const block = pkg[section];
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;

      for (const [packageName, declaredRange] of Object.entries(
        block as Record<string, unknown>,
      )) {
        // Ranges are always strings in valid manifests. Anything else is
        // malformed — skip the entry rather than coercing it.
        if (typeof declaredRange !== "string") continue;

        dependencies.push({
          packageName,
          declaredRange,
          resolvedVersion: null,
          manifestPath: path,
          section,
          ecosystem: "npm",
        });
      }
    }
  }

  console.log(
    `[dep-reader] Done. ${dependencies.length} declared dependencies across ` +
      `${manifestPaths.length} manifest(s). ${skipped.length} skipped.`,
  );

  return { dependencies, manifestPaths, truncated, skipped };
}

/**
 * Collapses duplicate package names across workspaces into one entry each.
 *
 * The repo_dependencies table is UNIQUE on (repo_id, ecosystem, package_name),
 * so a monorepo declaring `react` in three workspaces must not produce three
 * rows. When ranges disagree we keep the first seen and record the rest in
 * `conflictingRanges` — the caller decides what to do, we do not silently
 * pick a winner and pretend there was no disagreement.
 */
export function dedupeDependencies(
  dependencies: DeclaredDependency[],
): Array<DeclaredDependency & { conflictingRanges: string[] }> {
  const byName = new Map<string, DeclaredDependency & { conflictingRanges: string[] }>();

  for (const dep of dependencies) {
    const existing = byName.get(dep.packageName);

    if (!existing) {
      byName.set(dep.packageName, { ...dep, conflictingRanges: [] });
      continue;
    }

    if (
      existing.declaredRange !== dep.declaredRange &&
      !existing.conflictingRanges.includes(dep.declaredRange)
    ) {
      existing.conflictingRanges.push(dep.declaredRange);
    }
  }

  return [...byName.values()];
}
