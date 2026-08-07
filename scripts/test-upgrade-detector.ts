/**
 * Manual test for lib/dependency/upgrade-detector.ts
 *
 * Scans a repo for dependency major-version upgrades and writes them to
 * the repo_dependencies and upgrade_candidates tables.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-upgrade-detector.ts
 *
 * Expected output (repo with upgradeable dependencies):
 *   Repo: Coder3257/api-sentinel  branch: main  installation: 150122813
 *   [upgrade-detector] Scanning Coder3257/api-sentinel@main for dependency upgrades...
 *   [dep-reader] Fetching tree for Coder3257/api-sentinel@main ...
 *   [dep-reader] Reading N package.json file(s) ...
 *   [upgrade-detector] Found M unique dependencies across N manifest(s).
 *   [upgrade-detector] X major upgrades available.
 *   [upgrade-detector] Y new upgrade candidate(s) written to DB.
 *
 *   ── Results ──────────────────────────────────
 *   total dependencies      : M
 *   upgrades found          : X
 *   new candidates          : Y
 *   truncated               : false
 *   skipped manifests       : 0
 *
 *   New upgrade candidates:
 *     • react: 18.2.0 → 19.2.8
 *     • stripe: 14.0.0 → 22.4.0
 */

import { getSupabaseClient } from "../lib/supabase/client";
import { detectDependencyUpgrades } from "../lib/dependency/upgrade-detector";

async function main(): Promise<void> {
  console.log("\n── Upgrade Detector Test ──\n");

  // ── Step 1: Load a repo with actual dependencies ─────────────────────────
  console.log("Loading repos from Supabase...");
  const supabase = getSupabaseClient();
  const { data: repos, error } = await supabase
    .from("repos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("✗ Supabase error:", error.message);
    process.exit(1);
  }

  if (!repos || repos.length === 0) {
    console.error(
      "✗ No repos found in DB. Re-install the GitHub App on your test repo first.",
    );
    process.exit(1);
  }

  console.log(`Found ${repos.length} repo(s) in DB:`);
  for (const r of repos) {
    console.log(`  • ${r.owner}/${r.name}  (installation_id: ${r.installation_id})`);
  }

  // Use api-sentinel (index 1) since it has package.json with real dependencies
  const repo = repos.find((r) => r.name === "api-sentinel") || repos[0];
  console.log(
    `\nUsing: ${repo.owner}/${repo.name}  branch: ${repo.default_branch}  installation: ${repo.installation_id}\n`,
  );

  // ── Step 2: Run upgrade detector ──────────────────────────────────────────
  const result = await detectDependencyUpgrades(
    repo.id,
    repo.installation_id,
    repo.owner,
    repo.name,
    repo.default_branch,
  );

  // ── Step 3: Print results ─────────────────────────────────────────────────
  console.log("\n── Results ──────────────────────────────────\n");
  console.log(`total dependencies      : ${result.totalDependencies}`);
  console.log(`upgrades found          : ${result.upgradesFound}`);
  console.log(`new candidates          : ${result.newCandidates.length}`);
  console.log(`truncated               : ${result.truncated}`);
  console.log(`skipped manifests       : ${result.skippedManifests}`);

  if (result.newCandidates.length > 0) {
    console.log("\nNew upgrade candidates:");
    for (const c of result.newCandidates) {
      console.log(`  • ${c.packageName}: ${c.fromVersion} → ${c.toVersion}`);
    }
    console.log(
      "\n✓ Detector works. These upgrade candidates are now in the database.",
    );
    console.log(
      "  Next step: wire this into the cron to automatically create scans for them.",
    );
  } else if (result.upgradesFound > 0) {
    console.log(
      "\n✓ Detector works. All upgrades were already in the database (idempotent).",
    );
  } else {
    console.log(
      "\n✓ Detector works (0 upgrades — all dependencies are up to date).",
    );
  }

  console.log("");
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
