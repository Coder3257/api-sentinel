import { detectPackageImports } from "../lib/github/repo-scanner";

interface TestCase {
  name: string;
  code: string;
  targetPackage: string;
  expected: boolean;
}

const testCases: TestCase[] = [
  // 1. named import
  {
    name: "named import",
    code: `import { x } from 'pkg';`,
    targetPackage: "pkg",
    expected: true,
  },
  // 2. default import
  {
    name: "default import",
    code: `import pkg from 'pkg';`,
    targetPackage: "pkg",
    expected: true,
  },
  // 3. namespace import
  {
    name: "namespace import",
    code: `import * as pkg from 'pkg';`,
    targetPackage: "pkg",
    expected: true,
  },
  // 4. require
  {
    name: "require",
    code: `const pkg = require('pkg');`,
    targetPackage: "pkg",
    expected: true,
  },
  // 5. subpath import
  {
    name: "subpath import",
    code: `import x from 'pkg/subpath';`,
    targetPackage: "pkg",
    expected: true,
  },
  // 6. scoped package
  {
    name: "scoped package",
    code: `import x from '@scope/pkg';`,
    targetPackage: "@scope/pkg",
    expected: true,
  },
  {
    name: "scoped package subpath",
    code: `import x from '@scope/pkg/subpath';`,
    targetPackage: "@scope/pkg",
    expected: true,
  },
  // 7. prefix collision (should NOT match)
  {
    name: "prefix collision (react-dom vs react)",
    code: `import ReactDOM from 'react-dom';`,
    targetPackage: "react",
    expected: false,
  },
  {
    name: "prefix collision (pkg-sibling vs pkg)",
    code: `import x from 'pkg-sibling';`,
    targetPackage: "pkg",
    expected: false,
  },
  // 8. unrelated import (should NOT match)
  {
    name: "unrelated import",
    code: `import lodash from 'lodash';`,
    targetPackage: "react",
    expected: false,
  },
  // Extra: template literals require
  {
    name: "require with template literal",
    code: `const pkg = require(\`pkg\`);`,
    targetPackage: "pkg",
    expected: true,
  },
];

function runTests() {
  console.log("Running Import Scanner Tests...\n");
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = detectPackageImports(tc.code, "test-file.ts", tc.targetPackage);
    if (result === tc.expected) {
      console.log(`✓ PASS: "${tc.name}" (target: "${tc.targetPackage}")`);
      passed++;
    } else {
      console.log(`✗ FAIL: "${tc.name}" (target: "${tc.targetPackage}")`);
      console.log(`  Code:     ${tc.code.trim()}`);
      console.log(`  Expected: ${tc.expected}`);
      console.log(`  Got:      ${result}`);
      failed++;
    }
  }

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
