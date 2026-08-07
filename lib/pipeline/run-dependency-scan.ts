/**
 * lib/pipeline/run-dependency-scan.ts
 *
 * The dependency-upgrade counterpart to run-pipeline.ts.
 *
 * Where run-pipeline.ts is triggered by a new Stripe changelog entry, this is
 * triggered by a dependency having a major version available. Both converge on
 * the same `scans` table — migration 007 made changelog_id nullable and added
 * upgrade_candidate_id, with a CHECK enforcing exactly one trigger source.
 *
 * Scope note: this creates scan rows for detected upgrades. It does NOT yet
 * generate patches or open PRs for them — that path still belongs to the
 * Stripe-specific pipeline and needs a generic patch generator before it can
 * be reused here. Scans land in `pending` and are picked up once that exists.
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { detectDependencyUpgrades } from "@/lib/dependency/upgrade-detector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoRow {
  id: string;
  owner: string;
  name: string;
  installation_id: number;
  default_branch: string;
}

export interface RepoUpgradeReport {
  repo: string;
  totalDependencies: number;
  upgradesFound: number;
  scansCreated: number;
  /** Set when this repo failed; the run continues past it. */
  error?: string;
}

export interface DependencyScanResult {
  reposProcessed: number;
  totalUpgradesFound: number;
  totalScansCreated: number;
  reports: RepoUpgradeReport[];
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type Supabase = ReturnType<typeof getSupabaseClient>;

/**
 * Creates a scans row for (repo, upgrade_candidate) if one does not exist.
 *
 * Idempotency comes from the partial unique index added in migration 007:
 *   UNIQUE (repo_id, upgrade_candidate_id) WHERE upgrade_candidate_id IS NOT NULL
 *
 * Returns false when the scan already existed, so a re-run does not inflate
 * counts or re-trigger work for a candidate already in flight.
 */
async function createScanForCandidate(
  supabase: Supabase,
  repoId: string,
  candidateId: string,
): Promise<boolean> {
  const { error } = await supabase.from("scans").insert({
    repo_id: repoId,
    changelog_id: null,
    upgrade_candidate_id: candidateId,
    status: "pending",
  });

  if (!error) return true;

  // 23505 = unique_violation. Expected on re-runs; anything else is real.
  if (error.code === "23505") return false;

  throw new Error(
    `Failed to create scan for repo=${repoId} candidate=${candidateId}: ${error.message}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans every connected repo for dependency upgrades and creates scan rows.
 *
 * A failure on one repo (deleted from GitHub, revoked installation, registry
 * outage) is recorded in that repo's report and the run continues. One bad
 * repo must not stop the other users' scans.
 *
 * @param repoId Optional. When set, scope the run to a single DB repo id.
 */
export async function runDependencyScan(
  repoId?: string,
): Promise<DependencyScanResult> {
  const supabase = getSupabaseClient();

  console.log(
    `[dep-scan] Starting dependency scan${repoId ? ` for repoId=${repoId}` : " for all repos"}`,
  );

  let reposQuery = supabase
    .from("repos")
    .select("id, owner, name, installation_id, default_branch");

  if (repoId) {
    reposQuery = reposQuery.eq("id", repoId);
  }

  const { data: repos, error: reposErr } = await reposQuery;

  if (reposErr) {
    throw new Error(`Failed to load repos: ${reposErr.message}`);
  }

  const repoRows = (repos ?? []) as RepoRow[];

  const result: DependencyScanResult = {
    reposProcessed: repoRows.length,
    totalUpgradesFound: 0,
    totalScansCreated: 0,
    reports: [],
  };

  if (repoRows.length === 0) {
    console.log("[dep-scan] No connected repos. Nothing to do.");
    return result;
  }

  for (const repo of repoRows) {
    const label = `${repo.owner}/${repo.name}`;

    try {
      const detection = await detectDependencyUpgrades(
        repo.id,
        repo.installation_id,
        repo.owner,
        repo.name,
        repo.default_branch,
      );

      let scansCreated = 0;
      for (const candidate of detection.newCandidates) {
        const created = await createScanForCandidate(supabase, repo.id, candidate.id);
        if (created) scansCreated += 1;
      }

      // Catch-up path for orphaned upgrade candidates
      const { data: existingScans } = await supabase
        .from("scans")
        .select("upgrade_candidate_id")
        .eq("repo_id", repo.id)
        .not("upgrade_candidate_id", "is", null);

      const existingCandidateIds = new Set(
        (existingScans ?? []).map((s) => s.upgrade_candidate_id)
      );

      const { data: allCandidates } = await supabase
        .from("upgrade_candidates")
        .select(`
          id,
          repo_dependencies!inner (
            repo_id,
            package_name
          )
        `)
        .eq("repo_dependencies.repo_id", repo.id);

      for (const candidate of allCandidates ?? []) {
        const repoDep = Array.isArray(candidate.repo_dependencies)
          ? candidate.repo_dependencies[0]
          : candidate.repo_dependencies;
        if (repoDep?.package_name?.startsWith("@types/")) {
          continue;
        }
        if (!existingCandidateIds.has(candidate.id)) {
          const created = await createScanForCandidate(supabase, repo.id, candidate.id);
          if (created) scansCreated += 1;
        }
      }

      result.totalUpgradesFound += detection.upgradesFound;
      result.totalScansCreated += scansCreated;
      result.reports.push({
        repo: label,
        totalDependencies: detection.totalDependencies,
        upgradesFound: detection.upgradesFound,
        scansCreated,
      });

      console.log(
        `[dep-scan] ${label}: ${detection.upgradesFound} upgrade(s), ${scansCreated} scan(s) created.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[dep-scan] ${label} failed: ${message}`);
      result.reports.push({
        repo: label,
        totalDependencies: 0,
        upgradesFound: 0,
        scansCreated: 0,
        error: message,
      });
    }
  }

  console.log(
    `[dep-scan] Done. repos=${result.reposProcessed} ` +
      `upgrades=${result.totalUpgradesFound} scans=${result.totalScansCreated}`,
  );

  return result;
}
