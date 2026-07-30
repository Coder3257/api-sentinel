/**
 * Manual test for lib/github/repo-scanner.ts
 *
 * Scans the test repo (Coder3257/ravi-dev) for Stripe SDK usage.
 * Reads installation ID and repo info from Supabase so it exercises
 * the real DB path, not just hard-coded values.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-repo-scanner.ts
 *
 * If the test repo has no Stripe imports, the output will show 0 files —
 * that's expected and correct. To test file detection:
 *   1. Add a file to ravi-dev containing:  import Stripe from 'stripe'
 *   2. Also add stripe to package.json dependencies
 *   3. Re-run this script
 *
 * Expected output (empty repo):
 *   Repo: Coder3257/ravi-dev  branch: main  installation: 149830581
 *   Fetching tree for Coder3257/ravi-dev@main ...
 *   Tree: N blobs, truncated=false
 *   No stripe dependency in package.json
 *   Scanning N source files ...
 *   Done. 0 file(s) import stripe out of N scanned.
 *
 *   hasStripeDependency : false
 *   stripeVersion       : null
 *   files found         : 0
 *   scanTruncated       : false
 */

import { getSupabaseClient } from "../lib/supabase/client";
import { scanRepoForStripeUsage } from "../lib/github/repo-scanner";

async function main(): Promise<void> {
  console.log("\n── Piece 5: Repo Scanner Test ──\n");

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
      "✗ No repos found in DB. Re-install the GitHub App on your test repo first (triggers installation.created webhook).",
    );
    process.exit(1);
  }

  console.log(`Found ${repos.length} repo(s) in DB:`);
  for (const r of repos) {
    console.log(`  • ${r.owner}/${r.name}  (installation_id: ${r.installation_id})`);
  }

  const repo = repos[0];
  console.log(`\nUsing: ${repo.owner}/${repo.name}  branch: ${repo.default_branch}  installation: ${repo.installation_id}\n`);

  // ── Step 2: Run scanner ───────────────────────────────────────────────────
  const result = await scanRepoForStripeUsage(
    repo.installation_id,
    repo.owner,
    repo.name,
    repo.default_branch,
  );

  // ── Step 3: Print results ─────────────────────────────────────────────────
  console.log("\n── Results ──────────────────────────────────\n");
  console.log(`hasStripeDependency : ${result.hasStripeDependency}`);
  console.log(`stripeVersion       : ${result.stripeVersion ?? "null"}`);
  console.log(`files found         : ${result.files.length}`);
  console.log(`scanTruncated       : ${result.scanTruncated}`);

  if (result.files.length > 0) {
    console.log("\nFiles importing stripe:");
    for (const f of result.files) {
      const preview = f.content
        .split("\n")
        .find((line) => /stripe/i.test(line))
        ?.trim();
      console.log(`  • ${f.path}`);
      if (preview) console.log(`      → ${preview}`);
    }
    console.log(
      "\n✓ Scanner works. These files will be sent to the AI patch generator in Piece 6.",
    );
  } else {
    console.log(
      "\n✓ Scanner works (0 stripe files — expected if repo has no stripe imports).",
    );
    console.log(
      "  To test file matching: add a file with  import Stripe from 'stripe'  and re-run.",
    );
  }

  console.log("");
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
