/**
 * Manual test for lib/github/pr-opener.ts (Piece 7).
 *
 * Opens a REAL pull request on the test repo (Coder3257/ravi-dev) using a
 * mock patch set, exercising the full Git Data API path:
 *   blob -> tree -> commit -> ref -> PR.
 *
 * We use a self-contained mock PatchResult here (no Gemini call) so this test
 * only exercises the PR-opener, not the AI step. The patch writes a single
 * harmless file (api-sentinel-demo/PATCH_DEMO.md) so it never clobbers real
 * source. Close/delete the PR + branch afterward.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-pr-opener.ts
 *
 * Pass --record to also insert a pull_requests row. That requires a real
 * scans.id; by default we skip the DB and only test the GitHub side.
 *
 * Expected output:
 *   Using: Coder3257/ravi-dev  branch: main  installation: 149830581
 *   [pr-opener] ... opening PR "api-sentinel/stripe-fix-..." with 1 file(s)
 *   [pr-opener] Opened PR #N: https://github.com/Coder3257/ravi-dev/pull/N
 *   PR #N        : https://github.com/...
 *   branch       : api-sentinel/stripe-fix-...
 *   committed    : api-sentinel-demo/PATCH_DEMO.md
 */

import { getSupabaseClient } from "../lib/supabase/client";
import { openFixPr, openAndRecordFixPr } from "../lib/github/pr-opener";
import type { PatchResult } from "../lib/ai/patch-generator";
import type { SpecChange } from "../lib/stripe/changelog";

async function main(): Promise<void> {
  console.log("\n── Piece 7: PR Opener Test ──\n");

  const record = process.argv.includes("--record");

  // ── Step 1: Load the test repo from Supabase ─────────────────────────────
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
      "✗ No repos in DB. Re-install the GitHub App on the test repo first.",
    );
    process.exit(1);
  }

  const repo = repos[0];
  console.log(
    `\nUsing: ${repo.owner}/${repo.name}  branch: ${repo.default_branch}  installation: ${repo.installation_id}\n`,
  );

  // ── Step 2: Build a mock change set + patch ──────────────────────────────
  const stamp = new Date().toISOString();

  const changes: SpecChange[] = [
    {
      type: "required_added",
      location: "components.schemas.charge.properties.currency",
      description: "Required field added to charge: .currency",
    },
  ];
  const changesSummary =
    "Stripe now requires `currency` on charge creation (test change set)";

  const demoContent = [
    `# API Sentinel — PR Opener Smoke Test`,
    ``,
    `This file was created by scripts/test-pr-opener.ts to verify the`,
    `Git Data API commit path (blob -> tree -> commit -> ref -> PR).`,
    ``,
    `- Generated at: ${stamp}`,
    `- Safe to delete. Close this PR and delete the branch.`,
    ``,
  ].join("\n");

  const patches: PatchResult[] = [
    {
      filePath: "api-sentinel-demo/PATCH_DEMO.md",
      originalContent: "",
      patchedContent: demoContent,
      reasoning:
        "Created a demo marker file to validate the atomic commit + PR flow. No real source touched.",
      changed: true,
    },
    // An unchanged patch to confirm it is filtered out (not committed).
    {
      filePath: "api-sentinel-demo/SHOULD_NOT_COMMIT.md",
      originalContent: "same",
      patchedContent: "same",
      reasoning: "No change needed — must be skipped by openFixPr.",
      changed: false,
    },
  ];

  // ── Step 3: Open the PR ───────────────────────────────────────────────────
  const input = {
    installationId: Number(repo.installation_id),
    owner: repo.owner as string,
    repo: repo.name as string,
    baseBranch: repo.default_branch as string,
    patches,
    changes,
    changesSummary,
    draft: false,
  };

  const result = record
    ? await openAndRecordFixPr(input) // no scanId passed -> GitHub only, still safe
    : await openFixPr(input);

  // ── Step 4: Print results ─────────────────────────────────────────────────
  console.log("\n── Results ──────────────────────────────────\n");
  console.log(`PR #${result.prNumber}        : ${result.prUrl}`);
  console.log(`githubPrId   : ${result.githubPrId}`);
  console.log(`branch       : ${result.branchName}`);
  console.log(`committed    : ${result.committedFiles.join(", ")}`);

  if (result.committedFiles.length !== 1) {
    console.warn(
      `\n⚠ Expected exactly 1 committed file (unchanged patch should be filtered). Got ${result.committedFiles.length}.`,
    );
  } else {
    console.log(
      `\n✓ Unchanged patch was correctly filtered — only 1 file committed.`,
    );
  }

  console.log(
    `\n✓ PR opener works end to end. Close PR #${result.prNumber} and delete branch "${result.branchName}" to clean up.\n`,
  );
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
