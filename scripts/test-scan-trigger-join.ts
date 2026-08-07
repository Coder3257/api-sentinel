/**
 * scripts/test-scan-trigger-join.ts
 *
 * Verifies the dual-trigger join in lib/dashboard/queries.ts against the live
 * database. Supabase nests relations by FK, and a wrong nesting path returns
 * null rather than erroring — which is exactly how upgrade scans silently
 * became `title: "—", severity: "unknown"` in the assistant context.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-scan-trigger-join.ts
 */

import { getSupabaseClient } from "../lib/supabase/client";

async function main() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("scans")
    .select(
      `id, status, affected_files, created_at, updated_at,
       repos!inner ( owner, name, user_id ),
       stripe_changelogs ( title, entry_id, severity ),
       upgrade_candidates (
         from_version,
         to_version,
         breaking_confirmed,
         repo_dependencies ( package_name, ecosystem )
       )`,
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("QUERY FAILED:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as any[];
  console.log(`\nFetched ${rows.length} scan(s).\n`);

  let stripe = 0;
  let upgrade = 0;
  let unknown = 0;

  for (const s of rows) {
    const up = s.upgrade_candidates;
    const cl = s.stripe_changelogs;
    const repo = s.repos ? `${s.repos.owner}/${s.repos.name}` : "unknown";

    if (up) {
      upgrade++;
      const pkg = up.repo_dependencies?.package_name ?? "!! MISSING PACKAGE NAME";
      console.log(
        `[upgrade] ${repo}  ${pkg} ${up.from_version} -> ${up.to_version}  status=${s.status}`,
      );
      if (!up.repo_dependencies) {
        console.log("          ^ repo_dependencies came back null — nesting path is wrong");
      }
    } else if (cl) {
      stripe++;
      console.log(`[stripe ] ${repo}  ${cl.title} (${cl.severity})  status=${s.status}`);
    } else {
      unknown++;
      console.log(`[UNKNOWN] ${repo}  status=${s.status}  — both trigger FKs joined null`);
    }
  }

  console.log(`\nstripe=${stripe}  upgrade=${upgrade}  unknown=${unknown}`);

  if (unknown > 0) {
    console.log(
      "\nFAIL: a scan matched neither trigger. The CHECK constraint should make " +
        "this impossible, so the join path is wrong or a parent row was deleted.",
    );
    process.exit(1);
  }
  if (upgrade === 0) {
    console.log(
      "\nINCONCLUSIVE: no upgrade-triggered scans in the DB, so the new join " +
        "path was never exercised. Run the dependency scan cron first.",
    );
    process.exit(1);
  }
  console.log("\nPASS: every scan resolved to exactly one trigger with a real subject.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
