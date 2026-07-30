/**
 * Manual test for lib/stripe/changelog.ts
 *
 * Fetches the 2 most recent stripe/openapi tags, diffs them, and prints
 * a human-readable summary. No database writes.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-stripe-changelog.ts
 *
 * Expected output:
 *   Recent tags: v649, v648, v647, ...
 *   Diffing v648 → v649 ...
 *   Severity: breaking | additive | deprecation
 *   Changes (N total):
 *     [breaking]  path_removed          paths./v1/foo
 *     [additive]  property_added        components.schemas.Bar.properties.baz
 *     ...
 */

import { fetchRecentTags, fetchSpec, diffSpecs } from "../lib/stripe/changelog";
import type { SpecChange, Severity } from "../lib/stripe/changelog";

const SEVERITY_COLORS: Record<Severity, string> = {
  breaking: "\x1b[31m",    // red
  deprecation: "\x1b[33m", // yellow
  additive: "\x1b[32m",    // green
};
const RESET = "\x1b[0m";

const BREAKING_TYPES = new Set([
  "path_removed",
  "method_removed",
  "schema_removed",
  "property_removed",
  "type_changed",
  "required_added",
]);

function changeLabel(c: SpecChange): string {
  return BREAKING_TYPES.has(c.type) ? "breaking" : c.type === "deprecated" ? "deprecation" : "additive";
}

async function main(): Promise<void> {
  console.log("\nFetching recent stripe/openapi tags...\n");

  const tags = await fetchRecentTags(5);

  if (tags.length < 2) {
    console.error("✗ Need at least 2 tags to diff. Got:", tags.map((t) => t.name));
    process.exit(1);
  }

  console.log("Recent tags:", tags.map((t) => t.name).join(", "), "\n");

  const [prevTag, latestTag] = [tags[1], tags[0]];

  console.log(`Downloading spec at ${prevTag.name} ...`);
  const oldSpec = await fetchSpec(prevTag.name);
  console.log(`Downloading spec at ${latestTag.name} ...`);
  const newSpec = await fetchSpec(latestTag.name);

  console.log(`\nDiffing ${prevTag.name} → ${latestTag.name} ...\n`);

  const { severity, changes } = diffSpecs(oldSpec, newSpec);

  const color = SEVERITY_COLORS[severity];
  console.log(`Overall severity: ${color}${severity.toUpperCase()}${RESET}\n`);
  console.log(`Changes found: ${changes.length} total\n`);

  if (changes.length === 0) {
    console.log("  (no structural changes detected — specs are identical)");
  } else {
    // Group by severity bucket for readability
    const breaking = changes.filter((c) => BREAKING_TYPES.has(c.type));
    const deprecations = changes.filter((c) => c.type === "deprecated");
    const additive = changes.filter(
      (c) => !BREAKING_TYPES.has(c.type) && c.type !== "deprecated",
    );

    const printGroup = (label: string, color: string, items: SpecChange[]) => {
      if (items.length === 0) return;
      console.log(`${color}── ${label} (${items.length}) ──${RESET}`);
      for (const c of items) {
        console.log(`  ${c.type.padEnd(20)} ${c.location}`);
        console.log(`  ${"".padEnd(20)} ${"\x1b[90m"}${c.description}${RESET}\n`);
      }
    };

    printGroup("BREAKING", "\x1b[31m", breaking);
    printGroup("DEPRECATIONS", "\x1b[33m", deprecations);
    printGroup("ADDITIVE", "\x1b[32m", additive);
  }

  console.log("─".repeat(60));
  console.log(
    `✓ Test complete. entryId to store in DB: "${latestTag.name}"`,
  );
  console.log(
    `  Pass this as lastSeenEntryId next time to detect further changes.\n`,
  );
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
