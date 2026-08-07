/**
 * Manual test for lib/github/dependency-reader.ts
 *
 * Reads all package.json files from the test repo (Coder3257/ravi-dev)
 * and returns a flat list of declared dependencies.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-dependency-reader.ts
 *
 * Expected output (repo with dependencies):
 *   Repo: Coder3257/ravi-dev  branch: main  installation: 149830581
 *   Fetching tree for Coder3257/ravi-dev@main ...
 *   Reading N package.json file(s) ...
 *   Done. M declared dependencies across N manifest(s). 0 skipped.
 *
 *   ── Results ──────────────────────────────────
 *   manifests found         : N
 *   dependencies found      : M
 *   truncated               : false
 *   skipped manifests       : 0
 *
 *   Sample dependencies:
 *     • react (^18.2.0) from package.json
 *     • next (^14.0.0) from package.json
 */

import { getSupabaseClient } from "../lib/supabase/client";
import { readRepoDependencies, dedupeDependencies } from "../lib/github/dependency-reader";

async function main(): Promise<void> {
  console.log("\n── Dependency Reader Test ──\n");

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

  // ── Step 2: Run dependency reader ────────────────────────────────────────
  const result = await readRepoDependencies(
    repo.installation_id,
    repo.owner,
    repo.name,
    repo.default_branch,
  );

  // ── Step 3: Deduplicate for monorepo case ────────────────────────────────
  const deduped = dedupeDependencies(result.dependencies);

  // ── Step 4: Print results ─────────────────────────────────────────────────
  console.log("\n── Results ──────────────────────────────────\n");
  console.log(`manifests found         : ${result.manifestPaths.length}`);
  console.log(`dependencies found      : ${result.dependencies.length}`);
  console.log(`unique packages         : ${deduped.length}`);
  console.log(`truncated               : ${result.truncated}`);
  console.log(`skipped manifests       : ${result.skipped.length}`);

  if (result.skipped.length > 0) {
    console.log("\nSkipped manifests:");
    for (const s of result.skipped) {
      console.log(`  • ${s.path}`);
      console.log(`      → ${s.reason}`);
    }
  }

  if (deduped.length > 0) {
    console.log("\nDependencies found:");
    const sample = deduped.slice(0, 10);
    for (const dep of sample) {
      const conflict = dep.conflictingRanges.length > 0
        ? ` [CONFLICT: ${dep.conflictingRanges.join(", ")}]`
        : "";
      console.log(`  • ${dep.packageName} (${dep.declaredRange}) from ${dep.manifestPath}${conflict}`);
    }
    if (deduped.length > 10) {
      console.log(`  ... and ${deduped.length - 10} more`);
    }
    console.log(
      "\n✓ Reader works. Next step: wire this into the pipeline to detect major upgrades.",
    );
  } else {
    console.log(
      "\n✓ Reader works (0 dependencies — expected if repo has no package.json files).",
    );
    console.log(
      "  To test: add a package.json with dependencies and re-run.",
    );
  }

  console.log("");
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
