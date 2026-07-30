/**
 * lib/stripe/changelog.ts
 *
 * Fetches new Stripe OpenAPI spec versions from github.com/stripe/openapi,
 * diffs adjacent spec3.json snapshots, and classifies changes as
 * breaking | deprecation | additive.
 *
 * Design decisions:
 *  - Uses the public GitHub API (unauthenticated). The daily cron hits well
 *    under the 60 req/hour unauth limit (2 raw fetches + 1 tags call).
 *  - Downloads spec3.json via raw.githubusercontent.com (no API rate limit).
 *  - Diff is structural (JSON path comparison), not textual.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";

function repoOwner() {
  return process.env.STRIPE_OPENAPI_REPO_OWNER ?? "stripe";
}
function repoName() {
  return process.env.STRIPE_OPENAPI_REPO_NAME ?? "openapi";
}
function specPath() {
  return process.env.STRIPE_OPENAPI_SPEC_PATH ?? "openapi/spec3.json";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "breaking" | "deprecation" | "additive";

export type ChangeType =
  | "path_removed"
  | "path_added"
  | "method_removed"
  | "method_added"
  | "schema_removed"
  | "schema_added"
  | "property_removed"
  | "property_added"
  | "type_changed"
  | "required_added"
  | "deprecated";

export interface SpecChange {
  type: ChangeType;
  location: string;   // dot-path e.g. "paths./v1/charges.get"
  description: string;
}

export interface ChangelogEntry {
  entryId: string;            // tag name, e.g. "v649"
  title: string;
  publishedAt: Date;
  severity: Severity;
  rawDiff: string;            // JSON-serialised SpecChange[]
  breakingChanges: SpecChange[];
}

export interface GitHubTag {
  name: string;
  commit: { sha: string };
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

const UA = "api-sentinel/1.0";

async function ghGet(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} at ${url}`);
  }
  return res.json();
}

/**
 * Fetch the N most recent tags from stripe/openapi, newest first.
 */
export async function fetchRecentTags(n = 10): Promise<GitHubTag[]> {
  const url = `${GITHUB_API}/repos/${repoOwner()}/${repoName()}/tags?per_page=${n}`;
  return ghGet(url) as Promise<GitHubTag[]>;
}

/**
 * Download and parse spec3.json at a specific git ref (tag name or commit SHA).
 * Uses raw.githubusercontent.com — no API rate limit applies here.
 */
export async function fetchSpec(ref: string): Promise<Record<string, unknown>> {
  const url = `${GITHUB_RAW}/${repoOwner()}/${repoName()}/${ref}/${specPath()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`Failed to download spec at ref "${ref}": HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

const BREAKING_TYPES: ChangeType[] = [
  "path_removed",
  "method_removed",
  "schema_removed",
  "property_removed",
  "type_changed",
  "required_added",
];

const DEPRECATION_TYPES: ChangeType[] = ["deprecated"];

function classifySeverity(changes: SpecChange[]): Severity {
  if (changes.some((c) => BREAKING_TYPES.includes(c.type))) return "breaking";
  if (changes.some((c) => DEPRECATION_TYPES.includes(c.type)))
    return "deprecation";
  return "additive";
}

/**
 * Structurally diff two OpenAPI 3.x specs.
 * Covers: path additions/removals, HTTP method changes, component schema
 * additions/removals, property additions/removals, type changes, required
 * field additions, and deprecation toggles.
 *
 * Returns a flat list of SpecChange objects plus an overall severity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function diffSpecs(oldSpec: any, newSpec: any): { severity: Severity; changes: SpecChange[] } {
  const changes: SpecChange[] = [];

  // ── Paths ─────────────────────────────────────────────────────────────────
  const oldPaths: Record<string, unknown> = oldSpec.paths ?? {};
  const newPaths: Record<string, unknown> = newSpec.paths ?? {};
  const allPaths = new Set([...Object.keys(oldPaths), ...Object.keys(newPaths)]);

  for (const path of allPaths) {
    const inOld = path in oldPaths;
    const inNew = path in newPaths;

    if (inOld && !inNew) {
      changes.push({
        type: "path_removed",
        location: `paths.${path}`,
        description: `Endpoint removed: ${path}`,
      });
      continue;
    }
    if (!inOld && inNew) {
      changes.push({
        type: "path_added",
        location: `paths.${path}`,
        description: `New endpoint added: ${path}`,
      });
      continue;
    }

    // Both exist — diff HTTP methods
    const oldMethods = Object.keys((oldPaths[path] as Record<string, unknown>) ?? {});
    const newMethods = Object.keys((newPaths[path] as Record<string, unknown>) ?? {});

    for (const method of oldMethods) {
      if (!newMethods.includes(method)) {
        changes.push({
          type: "method_removed",
          location: `paths.${path}.${method}`,
          description: `HTTP method removed: ${method.toUpperCase()} ${path}`,
        });
      }
    }
    for (const method of newMethods) {
      if (!oldMethods.includes(method)) {
        changes.push({
          type: "method_added",
          location: `paths.${path}.${method}`,
          description: `HTTP method added: ${method.toUpperCase()} ${path}`,
        });
      }
    }
  }

  // ── Component schemas ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldSchemas: Record<string, any> = (oldSpec.components as any)?.schemas ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newSchemas: Record<string, any> = (newSpec.components as any)?.schemas ?? {};
  const allSchemas = new Set([
    ...Object.keys(oldSchemas),
    ...Object.keys(newSchemas),
  ]);

  for (const schema of allSchemas) {
    const oldSch = oldSchemas[schema];
    const newSch = newSchemas[schema];

    if (oldSch && !newSch) {
      changes.push({
        type: "schema_removed",
        location: `components.schemas.${schema}`,
        description: `Schema removed: ${schema}`,
      });
      continue;
    }
    if (!oldSch && newSch) {
      changes.push({
        type: "schema_added",
        location: `components.schemas.${schema}`,
        description: `Schema added: ${schema}`,
      });
      continue;
    }

    // Both exist — diff properties
    const oldProps: Record<string, unknown> = oldSch.properties ?? {};
    const newProps: Record<string, unknown> = newSch.properties ?? {};
    const newRequired: string[] = newSch.required ?? [];
    const allProps = new Set([
      ...Object.keys(oldProps),
      ...Object.keys(newProps),
    ]);

    for (const prop of allProps) {
      const inOldP = prop in oldProps;
      const inNewP = prop in newProps;

      if (inOldP && !inNewP) {
        changes.push({
          type: "property_removed",
          location: `components.schemas.${schema}.properties.${prop}`,
          description: `Property removed from ${schema}: .${prop}`,
        });
        continue;
      }
      if (!inOldP && inNewP) {
        const isRequired = newRequired.includes(prop);
        changes.push({
          type: isRequired ? "required_added" : "property_added",
          location: `components.schemas.${schema}.properties.${prop}`,
          description: isRequired
            ? `Required field added to ${schema}: .${prop}`
            : `Optional field added to ${schema}: .${prop}`,
        });
        continue;
      }

      // Both exist — check type change
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldP = oldProps[prop] as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newP = newProps[prop] as any;
      const oldType: string = oldP?.type ?? oldP?.["$ref"] ?? "";
      const newType: string = newP?.type ?? newP?.["$ref"] ?? "";

      if (oldType && newType && oldType !== newType) {
        changes.push({
          type: "type_changed",
          location: `components.schemas.${schema}.properties.${prop}`,
          description: `Type changed in ${schema}.${prop}: ${oldType} → ${newType}`,
        });
      }

      // Deprecation toggle
      if (!oldP?.deprecated && newP?.deprecated === true) {
        changes.push({
          type: "deprecated",
          location: `components.schemas.${schema}.properties.${prop}`,
          description: `Field deprecated in ${schema}: .${prop}`,
        });
      }
    }
  }

  return { severity: classifySeverity(changes), changes };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetches and diffs new Stripe OpenAPI spec versions since lastSeenEntryId.
 *
 * - If lastSeenEntryId is null (first run): records the latest tag as a
 *   baseline and returns [] — nothing to diff yet.
 * - Otherwise: diffs each tag newer than lastSeenEntryId against its
 *   predecessor, returning entries in chronological order (oldest first).
 *
 * The caller is responsible for persisting the returned entries to Supabase
 * and updating its record of the last-seen entry ID.
 */
export async function fetchNewChangelogEntries(
  lastSeenEntryId: string | null,
): Promise<ChangelogEntry[]> {
  const tags = await fetchRecentTags(10);

  if (tags.length === 0) {
    throw new Error("stripe/openapi has no tags — repo may have moved.");
  }

  const latestTag = tags[0];

  // First run — just establish a baseline.
  if (lastSeenEntryId === null) {
    console.log(
      `[changelog] First run — baseline: ${latestTag.name}. No entries returned.`,
    );
    return [];
  }

  // Already up to date.
  if (lastSeenEntryId === latestTag.name) {
    console.log(`[changelog] Already at latest (${latestTag.name}).`);
    return [];
  }

  // Find where we left off.
  const lastSeenIdx = tags.findIndex((t) => t.name === lastSeenEntryId);

  // If the last-seen tag has aged out of our 10-tag window, just diff the
  // two most recent tags as a best-effort catch-up.
  const newTags =
    lastSeenIdx === -1
      ? [tags[0]]
      : tags.slice(0, lastSeenIdx).reverse(); // oldest-first

  const results: ChangelogEntry[] = [];

  for (let i = 0; i < newTags.length; i++) {
    const prevTagName =
      i === 0
        ? lastSeenIdx === -1
          ? tags[1].name      // best-effort: diff latest-1 → latest
          : lastSeenEntryId
        : newTags[i - 1].name;

    const currTag = newTags[i];

    console.log(`[changelog] Diffing ${prevTagName} → ${currTag.name} ...`);

    const [oldSpec, newSpec] = await Promise.all([
      fetchSpec(prevTagName),
      fetchSpec(currTag.name),
    ]);

    const { severity, changes } = diffSpecs(oldSpec, newSpec);

    results.push({
      entryId: currTag.name,
      title: `Stripe OpenAPI ${currTag.name}`,
      publishedAt: new Date(),
      severity,
      rawDiff: JSON.stringify(changes),
      breakingChanges: changes,
    });
  }

  return results;
}
