/**
 * lib/dependency/upgrade-detector.ts
 *
 * Detects major-version upgrades available for a repo's dependencies.
 * This is the integration layer that connects:
 *   - dependency-reader.ts (reads package.json files from GitHub)
 *   - npm-client.ts (checks npm registry for latest versions)
 *   - database (writes repo_dependencies + upgrade_candidates)
 *
 * Flow:
 *   1. Read all package.json files from the repo
 *   2. For each unique package, check if a major upgrade is available
 *   3. Write dependencies to repo_dependencies table
 *   4. Write actionable upgrades to upgrade_candidates table
 *   5. Return the list of new upgrade candidates (these trigger scans)
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { readRepoDependencies, dedupeDependencies } from "@/lib/github/dependency-reader";
import { findMajorUpgrade, parseDeclaredVersion } from "@/lib/registry/npm-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeCandidate {
  id: string;
  dependencyId: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
}

export interface DetectionResult {
  /** Total unique dependencies found in the repo. */
  totalDependencies: number;
  /** How many had major upgrades available. */
  upgradesFound: number;
  /** Newly detected upgrade candidates (not previously in the DB). */
  newCandidates: UpgradeCandidate[];
  /** Repo manifests that were truncated or skipped. */
  truncated: boolean;
  skippedManifests: number;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Scans a repo for dependency upgrades and writes them to the database.
 *
 * This function is idempotent: running it multiple times on the same repo
 * updates the dependency snapshot and only returns NEW upgrade candidates.
 * Existing candidates are left alone (they may already have scans in progress).
 */
export async function detectDependencyUpgrades(
  repoId: string,
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
): Promise<DetectionResult> {
  console.log(`[upgrade-detector] Scanning ${owner}/${repo}@${branch} for dependency upgrades...`);

  const supabase = getSupabaseClient();

  // ── Step 1: Read dependencies from GitHub ────────────────────────────────
  const readResult = await readRepoDependencies(installationId, owner, repo, branch);
  const deduped = dedupeDependencies(readResult.dependencies);

  console.log(
    `[upgrade-detector] Found ${deduped.length} unique dependencies ` +
      `across ${readResult.manifestPaths.length} manifest(s).`,
  );

  if (deduped.length === 0) {
    return {
      totalDependencies: 0,
      upgradesFound: 0,
      newCandidates: [],
      truncated: readResult.truncated,
      skippedManifests: readResult.skipped.length,
    };
  }

  // ── Step 2: Check each dependency for major upgrades ─────────────────────
  const upgradesFound: Array<{
    packageName: string;
    declaredRange: string;
    fromVersion: string;
    toVersion: string;
  }> = [];

  for (const dep of deduped) {
    if (dep.packageName.startsWith("@types/")) {
      // DefinitelyTyped publishes no per-package release notes, these can never produce a patch.
      continue;
    }
    try {
      const upgrade = await findMajorUpgrade(dep.packageName, dep.declaredRange);

      if (upgrade && upgrade.isMajor) {
        upgradesFound.push({
          packageName: dep.packageName,
          declaredRange: dep.declaredRange,
          fromVersion: upgrade.from,
          toVersion: upgrade.to,
        });
      }
    } catch (err) {
      // Registry lookup failed (network error, malformed package, etc.)
      // Log but continue — one bad package shouldn't block the rest.
      console.warn(
        `[upgrade-detector] Failed to check ${dep.packageName}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[upgrade-detector] ${upgradesFound.length} major upgrades available.`);

  if (upgradesFound.length === 0) {
    return {
      totalDependencies: deduped.length,
      upgradesFound: 0,
      newCandidates: [],
      truncated: readResult.truncated,
      skippedManifests: readResult.skipped.length,
    };
  }

  // ── Step 3: Write dependencies to repo_dependencies ──────────────────────
  // Use upsert to update existing rows (repo_dependencies has UNIQUE constraint
  // on repo_id, ecosystem, package_name).
  const dependencyRows = deduped.map((dep) => ({
    repo_id: repoId,
    ecosystem: dep.ecosystem,
    package_name: dep.packageName,
    declared_range: dep.declaredRange,
    resolved_version: dep.resolvedVersion, // null for now — lockfile reading later
    detected_at: new Date().toISOString(),
  }));

  const { error: depsError } = await supabase
    .from("repo_dependencies")
    .upsert(dependencyRows, {
      onConflict: "repo_id,ecosystem,package_name",
    });

  if (depsError) {
    throw new Error(`Failed to write repo_dependencies: ${depsError.message}`);
  }

  // ── Step 4: Fetch dependency IDs for the packages with upgrades ──────────
  const packageNames = upgradesFound.map((u) => u.packageName);

  const { data: depIds, error: depIdsError } = await supabase
    .from("repo_dependencies")
    .select("id, package_name")
    .eq("repo_id", repoId)
    .in("package_name", packageNames);

  if (depIdsError || !depIds) {
    throw new Error(`Failed to fetch dependency IDs: ${depIdsError?.message}`);
  }

  const nameToId = new Map(depIds.map((d) => [d.package_name, d.id]));

  // ── Step 5: Write upgrade_candidates ──────────────────────────────────────
  // upgrade_candidates has UNIQUE (dependency_id, to_version).
  const candidateRows = upgradesFound
    .map((u) => {
      const depId = nameToId.get(u.packageName);
      if (!depId) {
        console.warn(`[upgrade-detector] Missing dependency_id for ${u.packageName} — skipping`);
        return null;
      }
      return {
        dependency_id: depId,
        from_version: u.fromVersion,
        to_version: u.toVersion,
        breaking_confirmed: false, // AI confirms this during patch generation
        breaking_source_url: null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // ignoreDuplicates maps to ON CONFLICT DO NOTHING, so RETURNING yields only
  // rows actually inserted. The default (DO UPDATE) returns pre-existing rows
  // too, which made every run look like a first discovery — any downstream
  // notification would re-fire daily for upgrades the user already saw.
  //
  // DO NOTHING also preserves breaking_confirmed / breaking_source_url on rows
  // the patch generator has already enriched; DO UPDATE would reset them to
  // the false/null defaults built above.
  const { data: insertedCandidates, error: candidatesError } = await supabase
    .from("upgrade_candidates")
    .upsert(candidateRows, {
      onConflict: "dependency_id,to_version",
      ignoreDuplicates: true,
    })
    .select("id, dependency_id, from_version, to_version");

  if (candidatesError) {
    throw new Error(`Failed to write upgrade_candidates: ${candidatesError.message}`);
  }

  // ── Step 6: Map inserted rows back to package names ───────────────────────
  // Invert nameToId once. The previous lookup scanned upgradesFound per row
  // and returned the first package whose id matched, which is fragile when
  // two packages share a dependency_id lookup miss.
  const idToName = new Map([...nameToId.entries()].map(([name, id]) => [id, name]));

  const newCandidates: UpgradeCandidate[] = (insertedCandidates ?? []).map((c) => ({
    id: c.id,
    dependencyId: c.dependency_id,
    packageName: idToName.get(c.dependency_id) ?? "",
    fromVersion: c.from_version,
    toVersion: c.to_version,
  }));

  console.log(
    `[upgrade-detector] ${newCandidates.length} new upgrade candidate(s) written to DB.`,
  );

  return {
    totalDependencies: deduped.length,
    upgradesFound: upgradesFound.length,
    newCandidates,
    truncated: readResult.truncated,
    skippedManifests: readResult.skipped.length,
  };
}
