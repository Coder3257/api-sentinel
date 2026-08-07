/**
 * Manual test for lib/registry/release-notes.ts
 *
 * Hits the real npm registry and GitHub API. Verifies we can turn a version
 * jump into actual breaking-change text — the input the patch generator needs.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-release-notes.ts
 *
 * Set GITHUB_TOKEN in .env.local to avoid the 60 req/hr unauthenticated limit.
 */

import { fetchReleaseNotes, parseGitHubRepo } from "../lib/registry/release-notes";

// ---------------------------------------------------------------------------
// Part 1: repository field parsing (pure, no network)
// ---------------------------------------------------------------------------

function testRepoParsing(): void {
  console.log("── Part 1: repository field parsing ──\n");

  const cases: Array<[unknown, string | null]> = [
    ["user/repo", "user/repo"],
    ["github:user/repo", "user/repo"],
    ["https://github.com/user/repo.git", "user/repo"],
    ["git+ssh://git@github.com/user/repo.git", "user/repo"],
    ["git+https://github.com/microsoft/TypeScript.git", "microsoft/TypeScript"],
    [{ type: "git", url: "https://github.com/eslint/eslint.git" }, "eslint/eslint"],
    [{ type: "git", url: "https://gitlab.com/user/repo.git" }, null],
    ["https://bitbucket.org/user/repo", null],
    [undefined, null],
    [null, null],
  ];

  let passed = 0;
  for (const [input, expected] of cases) {
    const actual = parseGitHubRepo(input);
    const ok = actual === expected;
    if (ok) passed += 1;
    console.log(
      `  ${ok ? "✓" : "✗"} ${JSON.stringify(input)} -> ${actual}${ok ? "" : `  (expected ${expected})`}`,
    );
  }

  console.log(`\n  ${passed}/${cases.length} parsing cases passed.\n`);
}

// ---------------------------------------------------------------------------
// Part 2: live fetches against the real upgrades found in api-sentinel
// ---------------------------------------------------------------------------

async function testLiveFetches(): Promise<void> {
  console.log("── Part 2: live release-note fetches ──\n");

  const cases: Array<{ pkg: string; from: string; to: string; note: string }> = [
    // The three real upgrade candidates detected in the api-sentinel repo.
    { pkg: "typescript", from: "5.0.0", to: "7.0.2", note: "fake nonexistent target - expect null" },
    { pkg: "typescript", from: "4.9.5", to: "5.3.3", note: "real versions - expect diff summary" },
    { pkg: "eslint", from: "9.0.0", to: "10.8.0", note: "single major jump" },
    { pkg: "@types/node", from: "20.0.0", to: "26.1.2", note: "expect null (DefinitelyTyped)" },
    { pkg: "typescript", from: "5.0.0", to: "999.0.0", note: "fake nonexistent version range - expect null" },
  ];

  for (const { pkg, from, to, note } of cases) {
    console.log(`\n▸ ${pkg} ${from} → ${to}   (${note})`);
    try {
      const result = await fetchReleaseNotes(pkg, from, to);

      if (!result) {
        console.log("  → null (no notes found)");
        continue;
      }

      console.log(`  source repo : ${result.sourceRepo}`);
      console.log(`  releases    : ${result.notes.length}`);
      console.log(`  truncated   : ${result.truncated}`);

      const totalChars = result.notes.reduce((n, r) => n + r.body.length, 0);
      console.log(`  total chars : ${totalChars}`);

      for (const n of result.notes.slice(0, 5)) {
        const firstLine = n.body.split("\n").find((l) => l.trim())?.trim().slice(0, 70) ?? "(empty)";
        console.log(`    • ${n.version}${n.isMajor ? " [MAJOR]" : ""} — ${n.title}`);
        console.log(`        ${firstLine}`);
      }
      if (result.notes.length > 5) {
        console.log(`    ... and ${result.notes.length - 5} more`);
      }

      // Ordering is load-bearing: migrations must read oldest → newest.
      const versions = result.notes.map((n) => n.version);
      const sorted = [...versions].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
      const ordered = JSON.stringify(versions) === JSON.stringify(sorted);
      console.log(`  ordering    : ${ordered ? "✓ oldest → newest" : "✗ WRONG ORDER"}`);
    } catch (err) {
      console.error(`  ✗ threw: ${err instanceof Error ? err.message : String(err)}`);
      console.error("    (fetchReleaseNotes should return null, never throw)");
    }
  }
}

async function main(): Promise<void> {
  console.log("\n── Release Notes Test ──\n");

  if (!process.env.GITHUB_TOKEN) {
    console.log("⚠ GITHUB_TOKEN not set — using unauthenticated GitHub API (60 req/hr).\n");
  }

  testRepoParsing();
  await testLiveFetches();

  console.log("\n✓ Done. Notes above are what the patch generator will receive.\n");
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
