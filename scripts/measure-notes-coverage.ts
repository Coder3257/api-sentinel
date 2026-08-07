/**
 * scripts/measure-notes-coverage.ts
 *
 * Answers the question the product depends on: for a realistic spread of npm
 * packages, what fraction have machine-readable breaking-change notes?
 *
 * This is not a unit test. It is a measurement that decides product direction.
 * If coverage is high, the AI patch generator is viable as the core feature.
 * If it is low, most upgrades can only be *reported*, not *fixed*, and the
 * product's promise has to change accordingly.
 *
 * The sample is deliberately weighted toward what real applications actually
 * depend on (runtime libraries, frameworks, SDKs) rather than the dev tooling
 * that happened to appear in api-sentinel's own package.json.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/measure-notes-coverage.ts
 *
 * GITHUB_TOKEN is strongly recommended: this makes ~2 GitHub calls per package
 * and the unauthenticated limit is 60/hr.
 */

import { fetchReleaseNotes } from "../lib/registry/release-notes";

interface SampleEntry {
  pkg: string;
  from: string;
  to: string;
  category: "runtime" | "framework" | "sdk" | "tooling" | "types";
}

/**
 * Version pairs are real major jumps a maintained app would plausibly face.
 * `to` is intentionally a version that already exists, so the range is real.
 */
const SAMPLE: SampleEntry[] = [
  // ── Runtime libraries — the bulk of a typical dependency tree ────────────
  { pkg: "express", from: "4.18.0", to: "5.0.0", category: "runtime" },
  { pkg: "axios", from: "0.27.0", to: "1.0.0", category: "runtime" },
  { pkg: "lodash", from: "3.10.1", to: "4.0.0", category: "runtime" },
  { pkg: "chalk", from: "4.1.2", to: "5.0.0", category: "runtime" },
  { pkg: "uuid", from: "8.3.2", to: "9.0.0", category: "runtime" },
  { pkg: "dotenv", from: "8.6.0", to: "16.0.0", category: "runtime" },
  { pkg: "zod", from: "3.22.0", to: "4.0.0", category: "runtime" },
  { pkg: "commander", from: "9.5.0", to: "11.0.0", category: "runtime" },

  // ── Frameworks — highest blast radius when they break ────────────────────
  { pkg: "react", from: "17.0.2", to: "18.0.0", category: "framework" },
  { pkg: "next", from: "13.5.0", to: "14.0.0", category: "framework" },
  { pkg: "vue", from: "2.7.0", to: "3.0.0", category: "framework" },
  { pkg: "svelte", from: "3.59.0", to: "4.0.0", category: "framework" },

  // ── SDKs — the original Stripe thesis, generalised ───────────────────────
  { pkg: "stripe", from: "14.0.0", to: "15.0.0", category: "sdk" },
  { pkg: "@supabase/supabase-js", from: "1.35.7", to: "2.0.0", category: "sdk" },
  { pkg: "mongoose", from: "6.12.0", to: "7.0.0", category: "sdk" },
  { pkg: "redis", from: "3.1.2", to: "4.0.0", category: "sdk" },

  // ── Tooling — what api-sentinel's own deps happened to be ────────────────
  { pkg: "eslint", from: "8.57.0", to: "9.0.0", category: "tooling" },
  { pkg: "typescript", from: "4.9.5", to: "5.0.0", category: "tooling" },
  { pkg: "jest", from: "28.1.3", to: "29.0.0", category: "tooling" },
  { pkg: "vite", from: "4.5.0", to: "5.0.0", category: "tooling" },

  // ── Types — expected to fail; included to quantify how much they distort ─
  { pkg: "@types/node", from: "18.0.0", to: "20.0.0", category: "types" },
  { pkg: "@types/react", from: "17.0.0", to: "18.0.0", category: "types" },
];

interface Outcome {
  entry: SampleEntry;
  ok: boolean;
  noteCount: number;
  majorCount: number;
  chars: number;
  source: string | null;
  /** True when the notes came from CHANGELOG.md rather than GitHub releases. */
  viaChangelog: boolean;
}

/** Rough proxy for "does this text actually discuss breaking changes?" */
function mentionsBreaking(text: string): boolean {
  return /\b(breaking|migration|migrat\w+|removed|deprecat\w+|no longer|upgrade guide)\b/i.test(
    text,
  );
}

async function main(): Promise<void> {
  console.log("\n── Release-Notes Coverage Measurement ──\n");

  if (!process.env.GITHUB_TOKEN) {
    console.log(
      "⚠ GITHUB_TOKEN not set. This run makes ~44 GitHub calls and the\n" +
        "  unauthenticated limit is 60/hr — results may be rate-limited.\n" +
        "  Add GITHUB_TOKEN=<a classic PAT, no scopes needed> to .env.local.\n",
    );
  }

  console.log(`Sampling ${SAMPLE.length} packages ...\n`);

  const outcomes: Outcome[] = [];

  for (const entry of SAMPLE) {
    process.stdout.write(`  ${entry.pkg.padEnd(24)} ${entry.from} → ${entry.to} ... `);

    try {
      const result = await fetchReleaseNotes(entry.pkg, entry.from, entry.to);

      if (!result) {
        outcomes.push({
          entry,
          ok: false,
          noteCount: 0,
          majorCount: 0,
          chars: 0,
          source: null,
          viaChangelog: false,
        });
        console.log("✗ no notes");
        continue;
      }

      const chars = result.notes.reduce((n, r) => n + r.body.length, 0);
      const majorCount = result.notes.filter((n) => n.isMajor).length;
      const viaChangelog = result.notes.some((n) => n.title.startsWith("CHANGELOG.md"));
      const breaking = result.notes.some((n) => mentionsBreaking(n.body));

      outcomes.push({
        entry,
        ok: true,
        noteCount: result.notes.length,
        majorCount,
        chars,
        source: result.sourceRepo,
        viaChangelog,
      });

      console.log(
        `✓ ${result.notes.length} note(s), ${majorCount} major, ${chars} chars` +
          `${viaChangelog ? " [CHANGELOG]" : ""}${breaking ? " [breaking text]" : " [NO breaking text]"}`,
      );
    } catch (err) {
      outcomes.push({
        entry,
        ok: false,
        noteCount: 0,
        majorCount: 0,
        chars: 0,
        source: null,
        viaChangelog: false,
      });
      console.log(`✗ threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n── Coverage by category ──────────────────────\n");

  const categories = ["runtime", "framework", "sdk", "tooling", "types"] as const;

  for (const cat of categories) {
    const inCat = outcomes.filter((o) => o.entry.category === cat);
    if (inCat.length === 0) continue;
    const okCount = inCat.filter((o) => o.ok).length;
    const pct = Math.round((okCount / inCat.length) * 100);
    const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "░");
    console.log(`  ${cat.padEnd(10)} ${bar} ${okCount}/${inCat.length}  (${pct}%)`);
  }

  const total = outcomes.length;
  const okTotal = outcomes.filter((o) => o.ok).length;
  const excludingTypes = outcomes.filter((o) => o.entry.category !== "types");
  const okExclTypes = excludingTypes.filter((o) => o.ok).length;
  const viaChangelogCount = outcomes.filter((o) => o.viaChangelog).length;

  console.log("\n── Overall ───────────────────────────────────\n");
  console.log(`  usable notes           : ${okTotal}/${total}  (${Math.round((okTotal / total) * 100)}%)`);
  console.log(
    `  excluding @types/*     : ${okExclTypes}/${excludingTypes.length}  ` +
      `(${Math.round((okExclTypes / excludingTypes.length) * 100)}%)`,
  );
  console.log(`  came via CHANGELOG.md  : ${viaChangelogCount}`);

  const failures = outcomes.filter((o) => !o.ok);
  if (failures.length > 0) {
    console.log("\n  No notes found for:");
    for (const f of failures) {
      console.log(`    • ${f.entry.pkg} (${f.entry.category})`);
    }
  }

  console.log("\n── What this means ───────────────────────────\n");
  const pctExcl = Math.round((okExclTypes / excludingTypes.length) * 100);
  if (pctExcl >= 75) {
    console.log("  Coverage is high. AI patch generation is viable as the core feature.");
  } else if (pctExcl >= 50) {
    console.log("  Coverage is moderate. Patch generation works for the majority, but the");
    console.log("  product must degrade gracefully — report the upgrade even when it cannot");
    console.log("  explain it.");
  } else {
    console.log("  Coverage is low. Most upgrades can be DETECTED but not EXPLAINED, so an");
    console.log("  AI-patch-first positioning would overpromise. Consider deriving breaking");
    console.log("  changes from the code itself (type diffs, compiler errors) instead of");
    console.log("  from prose that often does not exist.");
  }
  console.log("");
}

main().catch((err: Error) => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
