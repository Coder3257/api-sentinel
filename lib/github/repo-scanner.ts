/**
 * lib/github/repo-scanner.ts
 *
 * Scans a GitHub repo for files that import the `stripe` npm package.
 *
 * Algorithm:
 *  1. Fetch the full recursive file tree (one API call via git trees endpoint).
 *  2. Check package.json for `stripe` in dependencies.
 *  3. Filter tree to scannable source file extensions.
 *  4. Download and regex-test each source file in parallel batches of 10.
 *  5. Return only files that contain a Stripe import + the package.json metadata.
 *
 * Rate limits: GitHub App installations get 5,000 req/hour. A repo with
 * 100 source files uses ~102 calls (1 tree + 1 pkg.json + 100 contents).
 */

import { getInstallationOctokit } from "@/lib/github/app-auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions we'll download and inspect for Stripe imports. */
const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

/**
 * Hard cap on source files downloaded per scan.
 * Prevents runaway API usage on large monorepos.
 */
const MAX_FILES_PER_SCAN = 150;

/** Batch size for parallel content fetches. */
const FETCH_BATCH_SIZE = 10;

/**
 * Regex patterns that identify a file as using the `stripe` server SDK.
 * Intentionally NOT matching `@stripe/stripe-js` (browser SDK — out of MVP scope).
 */
const STRIPE_IMPORT_PATTERNS: RegExp[] = [
  /from\s+['"]stripe['"]/,           // import ... from 'stripe'
  /require\s*\(\s*['"]stripe['"]/,   // require('stripe')
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScannedFile {
  /** Repo-relative path, e.g. "src/lib/stripe.ts" */
  path: string;
  /** Full UTF-8 file content. */
  content: string;
  /** Human-readable reason this file was included. */
  reason: string;
}

export interface ScanResult {
  /** True if package.json lists `stripe` in dependencies or devDependencies. */
  hasStripeDependency: boolean;
  /** Semver string from package.json, e.g. "^14.0.0". Null if not found. */
  stripeVersion: string | null;
  /** Source files that contain a Stripe import. */
  files: ScannedFile[];
  /**
   * True if the repo had more than MAX_FILES_PER_SCAN source files.
   * When truncated, some files may have been missed.
   */
  scanTruncated: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type OctokitInstance = Awaited<ReturnType<typeof getInstallationOctokit>>;

function fileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot);
}

function hasStripeImport(content: string): boolean {
  return STRIPE_IMPORT_PATTERNS.some((re) => re.test(content));
}

/**
 * Download a single file from GitHub and return its UTF-8 content.
 * Uses the repos.getContent endpoint (returns base64-encoded content).
 */
async function fetchFileContent(
  octokit: OctokitInstance,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`Expected file at "${path}", got directory or non-file`);
  }

  if (!data.content) return "";

  // GitHub returns base64 with embedded newlines — strip them before decoding.
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString(
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans `owner/repo` at `branch` for files that import the Stripe server SDK.
 *
 * @param installationId  GitHub App installation ID for this repo.
 * @param owner           Repository owner (user or org).
 * @param repo            Repository name.
 * @param branch          Branch to scan (usually the default branch).
 */
export async function scanRepoForStripeUsage(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
): Promise<ScanResult> {
  const octokit = await getInstallationOctokit(installationId);

  // ── Step 1: Full recursive file tree ──────────────────────────────────────
  console.log(`[scanner] Fetching tree for ${owner}/${repo}@${branch} ...`);

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  const allBlobs = treeData.tree.filter(
    (item) => item.type === "blob" && typeof item.path === "string",
  );

  console.log(
    `[scanner] Tree: ${allBlobs.length} blobs, truncated=${treeData.truncated}`,
  );

  // ── Step 2: package.json ──────────────────────────────────────────────────
  let hasStripeDependency = false;
  let stripeVersion: string | null = null;

  const pkgEntry = allBlobs.find(
    (f) => f.path === "package.json" || f.path?.endsWith("/package.json")
  );
  if (pkgEntry) {
    try {
      const raw = await fetchFileContent(
        octokit,
        owner,
        repo,
        pkgEntry.path!,
        branch,
      );
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      if ("stripe" in allDeps) {
        hasStripeDependency = true;
        stripeVersion = allDeps["stripe"];
        console.log(`[scanner] stripe@${stripeVersion} found in package.json`);
      } else {
        console.log("[scanner] No stripe dependency in package.json");
      }
    } catch (err) {
      console.warn("[scanner] Could not read/parse package.json:", err);
    }
  }

  // ── Step 3: Filter to scannable source files ──────────────────────────────
  const sourceFiles = allBlobs.filter((f) =>
    SCANNABLE_EXTENSIONS.has(fileExtension(f.path!)),
  );

  const scanTruncated = sourceFiles.length > MAX_FILES_PER_SCAN;
  const filesToScan = sourceFiles.slice(0, MAX_FILES_PER_SCAN);

  if (scanTruncated) {
    console.warn(
      `[scanner] ${sourceFiles.length} source files — scanning first ${MAX_FILES_PER_SCAN} only`,
    );
  }

  console.log(`[scanner] Scanning ${filesToScan.length} source files ...`);

  // ── Step 4: Batch-download and inspect ────────────────────────────────────
  const matched: ScannedFile[] = [];

  for (let i = 0; i < filesToScan.length; i += FETCH_BATCH_SIZE) {
    const batch = filesToScan.slice(i, i + FETCH_BATCH_SIZE);

    const settled = await Promise.allSettled(
      batch.map(async (entry) => {
        const content = await fetchFileContent(
          octokit,
          owner,
          repo,
          entry.path!,
          branch,
        );
        return hasStripeImport(content)
          ? ({ path: entry.path!, content, reason: "imports stripe" } satisfies ScannedFile)
          : null;
      }),
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== null) {
        matched.push(result.value);
      } else if (result.status === "rejected") {
        console.warn("[scanner] Failed to fetch file:", result.reason);
      }
    }
  }

  console.log(
    `[scanner] Done. ${matched.length} file(s) import stripe out of ${filesToScan.length} scanned.`,
  );

  return {
    hasStripeDependency,
    stripeVersion,
    files: matched,
    scanTruncated,
  };
}
