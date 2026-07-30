/**
 * Manual test for lib/ai/patch-generator.ts using Gemini
 *
 * Uses a realistic mock Stripe breaking change (apiVersion string format
 * deprecated in favour of a Date object) against the actual
 * src/lib/stripe-client.ts content fetched live from the test repo.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-patch-generator.ts
 */

import { getSupabaseClient } from "../lib/supabase/client";
import { getInstallationOctokit } from "../lib/github/app-auth";
import { generatePatch } from "../lib/ai/patch-generator";
import type { SpecChange } from "../lib/stripe/changelog";

const MOCK_CHANGES: SpecChange[] = [
  {
    type: "type_changed",
    location: "components.schemas.APIVersion.properties.value",
    description:
      "apiVersion string format changed: date-string '2023-10-16' is no longer accepted. Use the exported ApiVersion type constant from the stripe package instead (e.g. Stripe.latestApiVersion).",
  },
  {
    type: "required_added",
    location: "components.schemas.StripeConstructorOptions.properties.typescript",
    description:
      "New required constructor option: typescript: true must be passed when using TypeScript to enable stricter type checking.",
  },
];

const MOCK_SUMMARY =
  "Stripe SDK breaking changes: apiVersion must use the exported Stripe.latestApiVersion constant instead of a hardcoded date string; TypeScript projects must pass typescript: true in the constructor options.";

async function main(): Promise<void> {
  console.log("\n── Piece 6: AI Patch Generator Test (Gemini) ──\n");

  // Step 1: Load repo from Supabase
  const supabase = getSupabaseClient();
  const { data: repos, error } = await supabase
    .from("repos")
    .select("*")
    .limit(1);

  if (error || !repos?.length) {
    console.error("✗ No repos in DB:", error?.message ?? "empty result");
    process.exit(1);
  }

  const repo = repos[0];
  console.log(`Repo: ${repo.owner}/${repo.name}  branch: ${repo.default_branch}\n`);

  // Step 2: Fetch the test file content from GitHub
  const TARGET_PATH = "src/lib/stripe-client.ts";
  console.log(`Fetching ${TARGET_PATH} from GitHub ...`);

  const octokit = await getInstallationOctokit(repo.installation_id);
  const { data } = await octokit.repos.getContent({
    owner: repo.owner,
    repo: repo.name,
    path: TARGET_PATH,
    ref: repo.default_branch,
  });

  if (Array.isArray(data) || data.type !== "file" || !data.content) {
    console.error("✗ Could not fetch file — is src/lib/stripe-client.ts committed?");
    process.exit(1);
  }

  const originalContent = Buffer.from(
    data.content.replace(/\n/g, ""),
    "base64",
  ).toString("utf8");

  console.log("Original content:");
  console.log("─".repeat(50));
  console.log(originalContent);
  console.log("─".repeat(50));

  // Step 3: Generate patch
  const model = process.env.GOOGLE_AI_MODEL ?? "gemini-2.5-pro";
  console.log(`\nCalling Gemini (${model}) ...\n`);

  const result = await generatePatch({
    changes: MOCK_CHANGES,
    changesSummary: MOCK_SUMMARY,
    file: { path: TARGET_PATH, content: originalContent },
  });

  // Step 4: Print results
  console.log("\n── Patch Result ──────────────────────────────\n");
  console.log(`Changed : ${result.changed}`);
  console.log(`\nReasoning:\n${result.reasoning}`);

  if (result.changed) {
    console.log("\n── Patched content ───────────────────────────\n");
    console.log(result.patchedContent);

    // Simple line-level diff preview
    console.log("\n── Diff preview (changed lines only) ────────\n");
    const oldLines = originalContent.split("\n");
    const newLines = result.patchedContent.split("\n");
    const maxLen = Math.max(oldLines.length, newLines.length);
    let diffCount = 0;
    for (let i = 0; i < maxLen; i++) {
      const o = oldLines[i] ?? "";
      const n = newLines[i] ?? "";
      if (o !== n) {
        if (o) console.log(`\x1b[31m- ${o}\x1b[0m`);
        if (n) console.log(`\x1b[32m+ ${n}\x1b[0m`);
        diffCount++;
      }
    }
    console.log(`\n${diffCount} line(s) changed.`);
  } else {
    console.log("\n(No changes — file already compatible or patch failed)");
  }

  console.log(
    "\n✓ Piece 6 test complete. PatchResult is ready for Piece 7 (PR opener).\n",
  );
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
