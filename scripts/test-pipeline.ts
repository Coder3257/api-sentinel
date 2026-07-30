/**
 * Manual test for lib/pipeline/run-pipeline.ts (Piece 8).
 *
 * Runs the full scan→patch→PR orchestrator against whatever repos are installed
 * in the DB (the test repo Coder3257/ravi-dev). This exercises the real Stripe
 * changelog fetch, repo scan, Gemini patch generation, and — if any file
 * changes — opens a REAL PR.
 *
 * Usage:
 *   # Diff everything newer than the Stripe baseline tag and run end to end:
 *   npx tsx --env-file=.env.local scripts/test-pipeline.ts v2347
 *
 *   # Use the DB high-water mark (whatever's newest in stripe_changelogs):
 *   npx tsx --env-file=.env.local scripts/test-pipeline.ts
 *
 *   # Force a first-run baseline (records latest tag, opens NO PRs):
 *   npx tsx --env-file=.env.local scripts/test-pipeline.ts --baseline
 *
 * Notes:
 *  - If the test repo has no stripe dependency / no stripe imports, every scan
 *    reports `skipped` — that's correct, not a failure.
 *  - Opening a real PR requires the repo to have a patchable stripe file AND
 *    Gemini to actually change it. Otherwise you'll see `no_change`.
 *  - Clean up any PRs/branches this opens afterward.
 */

import { runPipeline, runPipelineFromDb } from "../lib/pipeline/run-pipeline";

async function main(): Promise<void> {
  console.log("\n── Piece 8: Pipeline Orchestrator Test ──\n");

  const arg = process.argv[2];

  let resultPromise;
  if (arg === "--baseline") {
    console.log("Mode: baseline (lastSeenEntryId = null) — no PRs expected.\n");
    resultPromise = runPipeline(null);
  } else if (arg) {
    console.log(`Mode: diff newer than "${arg}".\n`);
    resultPromise = runPipeline(arg);
  } else {
    console.log("Mode: DB high-water mark (runPipelineFromDb).\n");
    resultPromise = runPipelineFromDb();
  }

  const result = await resultPromise;

  console.log("\n── Result ───────────────────────────────────\n");
  console.log(`baselineOnly        : ${result.baselineOnly}`);
  console.log(`newChangelogEntries : ${result.newChangelogEntries}`);
  console.log(`actionableEntries   : ${result.actionableEntries}`);
  console.log(`reposProcessed      : ${result.reposProcessed}`);
  console.log(`prsOpened           : ${result.prsOpened}`);

  if (result.scans.length > 0) {
    console.log("\nPer scan:");
    for (const s of result.scans) {
      const bits = [
        `${s.repo} × ${s.changelogEntryId}`,
        `[${s.severity}]`,
        `→ ${s.outcome}`,
      ];
      if (s.filesScanned !== undefined) bits.push(`files=${s.filesScanned}`);
      if (s.filesChanged !== undefined) bits.push(`changed=${s.filesChanged}`);
      if (s.prUrl) bits.push(s.prUrl);
      if (s.error) bits.push(`err="${s.error}"`);
      console.log(`  • ${bits.join("  ")}`);
    }
  } else {
    console.log("\n(no scans — no actionable entries or no installed repos)");
  }

  console.log("\n✓ Pipeline ran to completion.\n");
}

main().catch((err: Error) => {
  console.error("\n✗ Pipeline error:", err.message);
  process.exit(1);
});
