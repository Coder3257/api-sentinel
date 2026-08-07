import { parseDeclaredVersion } from "../lib/registry/npm-client";
import { hasUsableContent } from "../lib/registry/release-notes";
import { dedupeDependencies } from "../lib/github/dependency-reader";

// Helper assertions
function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${msg} | Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, msg: string) {
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((acc: any, key) => {
      acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
  };
  const aStr = JSON.stringify(sortKeys(actual));
  const eStr = JSON.stringify(sortKeys(expected));
  if (aStr !== eStr) {
    throw new Error(`FAIL: ${msg} | Expected ${eStr}, got ${aStr}`);
  }
}

function runParseDeclaredVersionTests() {
  console.log("--- parseDeclaredVersion Tests ---");
  const cases = [
    { input: "1.2.3", expected: "1.2.3" },
    { input: "^1.2.3", expected: "1.2.3" },
    { input: "~1.2.3", expected: "1.2.3" },
    { input: ">=1.2.3", expected: "1.2.3" },
    { input: "v1.2.3", expected: "1.2.3" },
    { input: "^v1.2.3", expected: "1.2.3" },
    { input: "   1.2.3   ", expected: "1.2.3" },
    { input: "invalid-semver", expected: null },
    { input: "", expected: null },
    { input: ">=1.2.3 <2.0.0", expected: "1.2.3" },
    { input: "18 || 19", expected: "18.0.0" }, // standard clean fallback or parsed result
  ];

  let passed = 0;
  for (const c of cases) {
    try {
      const actual = parseDeclaredVersion(c.input);
      // Wait, parseDeclaredVersion might handle some of these differently.
      // Let's check how parseDeclaredVersion behaves or verify it.
      assertEqual(actual, c.expected, `parseDeclaredVersion("${c.input}")`);
      console.log(`✓ parseDeclaredVersion("${c.input}") -> ${actual}`);
      passed++;
    } catch (e: any) {
      console.log(`✗ ${e.message}`);
    }
  }
  return passed;
}

function runHasUsableContentTests() {
  console.log("\n--- hasUsableContent Tests ---");
  const cases = [
    { input: "This is a real release note with some useful prose and details.", expected: true },
    { input: "Short text.", expected: false },
    { input: "See the release notes at https://stripe.com/changelog for more info.", expected: false },
    { input: "  \n  \t   ", expected: false },
    { input: "", expected: false },
    { input: null as any, expected: false },
    { input: undefined as any, expected: false },
    { input: "[Link text](https://stripe.com)", expected: false },
  ];

  let passed = 0;
  for (const c of cases) {
    try {
      const actual = hasUsableContent(c.input);
      assertEqual(actual, c.expected, `hasUsableContent(${JSON.stringify(c.input)})`);
      console.log(`✓ hasUsableContent(${JSON.stringify(c.input)}) -> ${actual}`);
      passed++;
    } catch (e: any) {
      console.log(`✗ ${e.message}`);
    }
  }
  return passed;
}

function runDedupeDependenciesTests() {
  console.log("\n--- dedupeDependencies Tests ---");
  const input = [
    { packageName: "eslint", declaredRange: "^9.0.0", resolvedVersion: "9.0.0", ecosystem: "npm" as const, manifestPath: "package.json", section: "dependencies" as const },
    { packageName: "eslint", declaredRange: "^9.0.0", resolvedVersion: "9.0.0", ecosystem: "npm" as const, manifestPath: "package.json", section: "dependencies" as const }, // exact duplicate
    { packageName: "eslint", declaredRange: "^10.0.0", resolvedVersion: "10.0.0", ecosystem: "npm" as const, manifestPath: "package.json", section: "dependencies" as const }, // same package, different version
    { packageName: "typescript", declaredRange: "^5.0.0", resolvedVersion: "5.0.0", ecosystem: "npm" as const, manifestPath: "package.json", section: "dependencies" as const },
    { packageName: "ESLint", declaredRange: "^9.0.0", resolvedVersion: "9.0.0", ecosystem: "npm" as const, manifestPath: "package.json", section: "dependencies" as const }, // case sensitivity check
  ];

  // We expect exact duplicates to be removed.
  // Same package with different version should NOT be removed (they represent different declarations).
  // Case sensitivity: check how dedupeDependencies handles ESLint vs eslint.
  // Let's see: dedupeDependencies dedupes by package name + declaredRange + ecosystem.
  const expected = [
    { packageName: "eslint", declaredRange: "^9.0.0", resolvedVersion: "9.0.0", ecosystem: "npm" as const, conflictingRanges: ["^10.0.0"], manifestPath: "package.json", section: "dependencies" as const },
    { packageName: "typescript", declaredRange: "^5.0.0", resolvedVersion: "5.0.0", ecosystem: "npm" as const, conflictingRanges: [], manifestPath: "package.json", section: "dependencies" as const },
    { packageName: "ESLint", declaredRange: "^9.0.0", resolvedVersion: "9.0.0", ecosystem: "npm" as const, conflictingRanges: [], manifestPath: "package.json", section: "dependencies" as const },
  ];

  let passed = 0;
  try {
    const actual = dedupeDependencies(input);
    assertDeepEqual(actual, expected, "dedupeDependencies()");
    console.log("✓ dedupeDependencies() successfully removed duplicates while keeping different versions / case differences");
    passed++;
  } catch (e: any) {
    console.log(`✗ ${e.message}`);
  }
  return passed;
}

function main() {
  console.log("=== RUNNING UNIT HELPER TESTS ===");
  const p1 = runParseDeclaredVersionTests();
  const p2 = runHasUsableContentTests();
  const p3 = runDedupeDependenciesTests();
  
  console.log(`\n=== RESULTS ===`);
  console.log(`parseDeclaredVersion: ${p1} passed`);
  console.log(`hasUsableContent: ${p2} passed`);
  console.log(`dedupeDependencies: ${p3} passed`);
}

main();
