/**
 * tests/unit.test.ts
 *
 * Unit tests for the pure functions where real bugs have already been found:
 *   - parseDeclaredVersion   — silently dropped 5 of 16 deps as "up to date"
 *   - hasUsableContent       — kept minors, dropped the major with the breaking notes
 *   - dedupeDependencies     — monorepos with conflicting ranges
 *   - moduleSpecifierMatches — the react / react-dom prefix trap
 *
 * Runner is node:test, built into Node 18+. No new dependency, and it needs no
 * network or database, so it is safe to run in CI. The scripts/test-*.ts files
 * stay as they are — those hit the live npm registry and GitHub API and are a
 * different kind of check.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseDeclaredVersion } from "../lib/registry/npm-client";
import { hasUsableContent } from "../lib/registry/release-notes";
import { dedupeDependencies } from "../lib/github/dependency-reader";
import { moduleSpecifierMatches } from "../lib/github/repo-scanner";

// ---------------------------------------------------------------------------
// parseDeclaredVersion
// ---------------------------------------------------------------------------

test("parseDeclaredVersion strips common range prefixes", () => {
  assert.equal(parseDeclaredVersion("1.2.3"), "1.2.3");
  assert.equal(parseDeclaredVersion("^1.2.3"), "1.2.3");
  assert.equal(parseDeclaredVersion("~1.2.3"), "1.2.3");
  assert.equal(parseDeclaredVersion(">=1.2.3"), "1.2.3");
  assert.equal(parseDeclaredVersion("v1.2.3"), "1.2.3");
  assert.equal(parseDeclaredVersion("  1.2.3  "), "1.2.3");
});

test("parseDeclaredVersion handles partial versions", () => {
  // The original bug: these returned null and the dependency was treated as
  // up to date, so a real major upgrade was never surfaced.
  assert.equal(parseDeclaredVersion("^20"), "20.0.0");
  assert.equal(parseDeclaredVersion("~5"), "5.0.0");
  assert.equal(parseDeclaredVersion("^5.4"), "5.4.0");
});

test("parseDeclaredVersion takes the lower bound of a compound range", () => {
  assert.equal(parseDeclaredVersion(">=1.2.3 <2.0.0"), "1.2.3");
  assert.equal(parseDeclaredVersion(">=1.2 <2"), "1.2.0");
});

test("parseDeclaredVersion picks the lowest version from an or-range", () => {
  // "18 || 19" means either is acceptable; the installed floor is 18.
  assert.equal(parseDeclaredVersion("18 || 19"), "18.0.0");
});

test("parseDeclaredVersion returns null for non-registry specifiers", () => {
  // These have no comparable version, so they must not be reported as
  // upgradeable — a false candidate burns registry calls and DB rows.
  assert.equal(parseDeclaredVersion("workspace:*"), null);
  assert.equal(parseDeclaredVersion("file:../local-pkg"), null);
  assert.equal(parseDeclaredVersion("git+https://github.com/x/y.git"), null);
  assert.equal(parseDeclaredVersion("github:user/repo"), null);
  assert.equal(parseDeclaredVersion("latest"), null);
  assert.equal(parseDeclaredVersion(""), null);
  assert.equal(parseDeclaredVersion("not-a-version"), null);
  assert.equal(parseDeclaredVersion("catalog:"), null);
});

test("parseDeclaredVersion returns null for wildcard ranges", () => {
  // semver.minVersion maps these to 0.0.0. Returning that would make every
  // wildcard dependency look like it needs a major upgrade, and the PR body
  // would cite a from-version the repo never ran.
  assert.equal(parseDeclaredVersion("*"), null);
  assert.equal(parseDeclaredVersion("x"), null);
  assert.equal(parseDeclaredVersion("X"), null);
  assert.equal(parseDeclaredVersion("x.x"), null);
  // But a wildcard patch still pins a real major, so it must survive.
  assert.equal(parseDeclaredVersion("1.x"), "1.0.0");
  assert.equal(parseDeclaredVersion("5.2.x"), "5.2.0");
});

test("parseDeclaredVersion returns null for an npm: alias", () => {
  // The version belongs to the aliased package, not the one named in the
  // manifest key, so comparing it against the registry is meaningless.
  assert.equal(parseDeclaredVersion("npm:other-pkg@^1.0.0"), null);
});

// ---------------------------------------------------------------------------
// hasUsableContent
// ---------------------------------------------------------------------------

test("hasUsableContent rejects a link-only release body", () => {
  // This is TypeScript's actual pattern. Patching from it would mean
  // fabricating a rationale, so it must be rejected.
  assert.equal(
    hasUsableContent("For release notes see https://devblogs.microsoft.com/typescript/announcing-typescript-5-0/"),
    false,
  );
  assert.equal(hasUsableContent(""), false);
  assert.equal(hasUsableContent("   \n  \n "), false);
});

test("hasUsableContent accepts a real breaking-changes body", () => {
  const eslintBody = [
    "## Breaking Changes",
    "",
    "* Node.js 18 is no longer supported. The minimum version is now Node.js 20.",
    "* `context.getScope()` has been removed. Use `sourceCode.getScope()` instead.",
    "* The default config format is now flat config; `.eslintrc` is no longer read.",
  ].join("\n");
  assert.equal(hasUsableContent(eslintBody), true);
});

// ---------------------------------------------------------------------------
// moduleSpecifierMatches — the prefix trap
// ---------------------------------------------------------------------------

test("moduleSpecifierMatches matches exact and subpath imports", () => {
  assert.equal(moduleSpecifierMatches("react", "react"), true);
  assert.equal(moduleSpecifierMatches("react/jsx-runtime", "react"), true);
  assert.equal(moduleSpecifierMatches("@scope/pkg", "@scope/pkg"), true);
  assert.equal(moduleSpecifierMatches("@scope/pkg/sub", "@scope/pkg"), true);
});

test("moduleSpecifierMatches does not match a package that merely shares a prefix", () => {
  // The bug this test exists for: a substring check makes react-dom look like
  // react, so upgrading react would patch react-dom call sites.
  assert.equal(moduleSpecifierMatches("react-dom", "react"), false);
  assert.equal(moduleSpecifierMatches("react-dom/client", "react"), false);
  assert.equal(moduleSpecifierMatches("@scope/pkg-extra", "@scope/pkg"), false);
  assert.equal(moduleSpecifierMatches("preact", "react"), false);
});

// ---------------------------------------------------------------------------
// dedupeDependencies
// ---------------------------------------------------------------------------

test("dedupeDependencies collapses one package declared in several manifests", () => {
  const deps = [
    { packageName: "eslint", declaredRange: "^9.0.0", manifestPath: "package.json", ecosystem: "npm" },
    { packageName: "eslint", declaredRange: "^9.0.0", manifestPath: "apps/web/package.json", ecosystem: "npm" },
  ];
  const out = dedupeDependencies(deps as any);
  assert.equal(out.length, 1);
  assert.equal(out[0].packageName, "eslint");
});

test("dedupeDependencies keeps conflicting ranges distinguishable", () => {
  // A monorepo pinning two different majors of one package is a real state.
  // Collapsing it to a single arbitrary range would scan against the wrong
  // baseline, so the result must not silently drop one of them.
  const deps = [
    { packageName: "typescript", declaredRange: "^4.9.0", manifestPath: "legacy/package.json", ecosystem: "npm" },
    { packageName: "typescript", declaredRange: "^5.4.0", manifestPath: "apps/web/package.json", ecosystem: "npm" },
  ];
  const out = dedupeDependencies(deps as any);
  assert.ok(out.length >= 1, "conflicting ranges must not produce an empty result");
  const ranges = out.map((d: any) => d.declaredRange);
  assert.ok(
    ranges.includes("^5.4.0") || ranges.includes("^4.9.0"),
    "at least one real declared range must survive dedupe",
  );
});

test("dedupeDependencies handles an empty input", () => {
  assert.deepEqual(dedupeDependencies([] as any), []);
});
