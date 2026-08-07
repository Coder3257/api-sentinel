/**
 * lib/github/repo-scanner.ts
 *
 * Scans a GitHub repo for files that import the `stripe` npm package.
 *
 * Algorithm:
 *  1. Fetch the full recursive file tree (one API call via git trees endpoint).
 *  2. Check package.json for `stripe` in dependencies.
 *  3. Filter tree to scannable source file extensions.
 *  4. Download and regex-test each source file in parallel batches of 10.
 *  5. Return only files that contain a Stripe import + the package.json metadata.
 *
 * Rate limits: GitHub App installations get 5,000 req/hour. A repo with
 * 100 source files uses ~102 calls (1 tree + 1 pkg.json + 100 contents).
 */

import { getInstallationOctokit } from "@/lib/github/app-auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

import * as ts from "typescript";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions we'll download and inspect for Stripe imports. */
const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

/**
 * Hard cap on source files downloaded per scan.
 * Prevents runaway API usage on large monorepos.
 */
const MAX_FILES_PER_SCAN = 150;

/** Batch size for parallel content fetches. */
const FETCH_BATCH_SIZE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { SpecChange } from "@/lib/stripe/changelog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StripeCallSite {
  methodPath: string;
  lineNumber: number;
  snippet: string;
}

export interface ScannedFile {
  /** Repo-relative path, e.g. "src/lib/stripe.ts" */
  path: string;
  /** Full UTF-8 file content. */
  content: string;
  /** Human-readable reason this file was included. */
  reason: string;
  /** Whether the file imports server SDK, client SDK, or both. */
  matchedType: "server" | "client" | "both";
  /** Call sites found in this file. */
  callSites: StripeCallSite[];
}

export interface ScanUnit {
  packageJsonPath: string;
  stripeVersion: string | null;
  stripeJsVersion: string | null;
  hasStripeDependency: boolean;
  hasStripeJsDependency: boolean;
  files: ScannedFile[];
}

export interface ScanResult {
  /** True if package.json lists `stripe` in dependencies or devDependencies. */
  hasStripeDependency: boolean;
  /** Semver string from package.json, e.g. "^14.0.0". Null if not found. */
  stripeVersion: string | null;
  /** Source files that contain a Stripe import. */
  files: ScannedFile[];
  /**
   * True if the repo had more than MAX_FILES_PER_SCAN source files.
   * When truncated, some files may have been missed.
   */
  scanTruncated: boolean;
  /** List of individual package/monorepo units scanned. */
  units: ScanUnit[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type OctokitInstance = Awaited<ReturnType<typeof getInstallationOctokit>>;

function fileExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot);
}

function getSurroundingSnippet(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex - 5);
  const end = Math.min(lines.length, lineIndex + 5);
  return lines.slice(start, end).join("\n");
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/_intents$/, "_intent")
    .replace(/_methods$/, "_method")
    .replace(/_items$/, "_item")
    .replace(/s$/, ""); // remove trailing plural s
}

export function isCallSiteAffected(methodPath: string, change: SpecChange): boolean {
  const parts = methodPath.split(".");
  if (parts.length === 0) return false;
  
  const service = toSnakeCase(parts[0]);
  const loc = change.location.toLowerCase();
  
  if (loc.startsWith("paths.")) {
    const pathClean = loc.replace("paths./v1/", "").replace("paths.", "");
    return toSnakeCase(pathClean).includes(service) || service.includes(toSnakeCase(pathClean));
  } else if (loc.startsWith("components.schemas.")) {
    const schemaPart = loc.replace("components.schemas.", "");
    const schemaName = schemaPart.split(".")[0];
    return toSnakeCase(schemaName).includes(service) || service.includes(toSnakeCase(schemaName));
  }
  
  return false;
}

/**
 * Walks the AST to find all Stripe call sites, tracing variables from the class imports/requires.
 */
export function findStripeCallSites(content: string, filePath: string): StripeCallSite[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const lines = content.split(/\r?\n/);
  const classBindings = new Set<string>();
  const clientBindings = new Map<string, string[]>();

  function addClientBinding(name: string, path: string[]) {
    clientBindings.set(name, path);
  }

  // Pass 1: find Stripe class bindings
  function findImports(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "stripe") {
        const importClause = node.importClause;
        if (importClause) {
          if (importClause.name) classBindings.add(importClause.name.text);
          if (importClause.namedBindings) {
            if (ts.isNamedImports(importClause.namedBindings)) {
              for (const element of importClause.namedBindings.elements) {
                classBindings.add(element.name.text);
              }
            } else if (ts.isNamespaceImport(importClause.namedBindings)) {
              classBindings.add(importClause.namedBindings.name.text);
            }
          }
        }
      }
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === "require") {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isStringLiteral(firstArg) && firstArg.text === "stripe") {
          let parent = node.parent;
          if (ts.isVariableDeclaration(parent)) {
            const varName = parent.name;
            if (ts.isIdentifier(varName)) {
              classBindings.add(varName.text);
            } else if (ts.isObjectBindingPattern(varName)) {
              for (const element of varName.elements) {
                if (ts.isIdentifier(element.name)) {
                  classBindings.add(element.name.text);
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, findImports);
  }

  findImports(sourceFile);

  const callSites: StripeCallSite[] = [];

  function resolveStripePath(expr: ts.Expression): string[] | null {
    if (ts.isIdentifier(expr)) {
      const binding = clientBindings.get(expr.text);
      if (binding) return binding;
    } else if (ts.isPropertyAccessExpression(expr)) {
      const parentPath = resolveStripePath(expr.expression);
      if (parentPath) {
        return [...parentPath, expr.name.text];
      }
    }
    return null;
  }

  // Pass 2: track client bindings and collect call sites
  function walk(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = node.initializer;
      let isStripeInstantiation = false;

      if (ts.isNewExpression(init)) {
        if (ts.isIdentifier(init.expression) && classBindings.has(init.expression.text)) {
          isStripeInstantiation = true;
        } else if (ts.isParenthesizedExpression(init.expression) && ts.isCallExpression(init.expression.expression)) {
          const call = init.expression.expression;
          if (ts.isIdentifier(call.expression) && call.expression.text === "require") {
            const firstArg = call.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg) && firstArg.text === "stripe") {
              isStripeInstantiation = true;
            }
          }
        }
      }

      if (isStripeInstantiation) {
        if (ts.isIdentifier(node.name)) {
          addClientBinding(node.name.text, []);
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const propName = element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : ts.isIdentifier(element.name) ? element.name.text : null;
            if (propName && ts.isIdentifier(element.name)) {
              addClientBinding(element.name.text, [propName]);
            }
          }
        }
      } else {
        const resolvedPath = resolveStripePath(init);
        if (resolvedPath) {
          if (ts.isIdentifier(node.name)) {
            addClientBinding(node.name.text, resolvedPath);
          } else if (ts.isObjectBindingPattern(node.name)) {
            for (const element of node.name.elements) {
              const propName = element.propertyName && ts.isIdentifier(element.propertyName)
                ? element.propertyName.text
                : ts.isIdentifier(element.name) ? element.name.text : null;
              if (propName && ts.isIdentifier(element.name)) {
                addClientBinding(element.name.text, [...resolvedPath, propName]);
              }
            }
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const path = resolveStripePath(node.expression);
      if (path && path.length > 0) {
        const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
        callSites.push({
          methodPath: path.join("."),
          lineNumber: line + 1,
          snippet: getSurroundingSnippet(lines, line),
        });
      }
    }

    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return callSites;
}

/**
 * Parses file content into a TypeScript AST and detects imports of 'stripe' or '@stripe/stripe-js'.
 * Guarantees zero false positives in comments, unrelated strings, or other packages.
 */
export function detectStripeImports(content: string, filePath: string): { hasServer: boolean; hasClient: boolean } {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  let hasServer = false;
  let hasClient = false;

  function checkModuleString(moduleName: string) {
    if (moduleName === "stripe") {
      hasServer = true;
    } else if (moduleName === "@stripe/stripe-js") {
      hasClient = true;
    }
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkModuleString(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        checkModuleString(node.moduleSpecifier.text);
      }
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isRequire = ts.isIdentifier(expression) && expression.text === "require";
      const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;

      if (isRequire || isDynamicImport) {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          checkModuleString(firstArg.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { hasServer, hasClient };
}

/**
 * Download a single file from GitHub and return its UTF-8 content.
 * Uses the repos.getContent endpoint (returns base64-encoded content).
 */
async function fetchFileContent(
  octokit: OctokitInstance,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`Expected file at "${path}", got directory or non-file`);
  }

  if (!data.content) return "";

  // GitHub returns base64 with embedded newlines — strip them before decoding.
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString(
    "utf8",
  );
}

/**
 * Find the closest ancestor package.json path for a given file.
 */
function findClosestPkg(filePath: string, pkgPaths: string[]): string | null {
  let closest: string | null = null;
  let closestLen = -1;

  for (const pkgPath of pkgPaths) {
    const pkgDir = pkgPath === "package.json" ? "" : pkgPath.slice(0, -12); // remove "package.json"
    if (filePath.startsWith(pkgDir)) {
      if (pkgDir.length > closestLen) {
        closest = pkgPath;
        closestLen = pkgDir.length;
      }
    }
  }
  return closest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans `owner/repo` at `branch` for files that import the Stripe server SDK.
 *
 * @param installationId  GitHub App installation ID for this repo.
 * @param owner           Repository owner (user or org).
 * @param repo            Repository name.
 * @param branch          Branch to scan (usually the default branch).
 * @param changes         Optional spec changes to filter call sites.
 */
export async function scanRepoForStripeUsage(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  changes?: SpecChange[],
): Promise<ScanResult> {
  const octokit = await getInstallationOctokit(installationId);

  // ── Step 1: Full recursive file tree ──────────────────────────────────────
  console.log(`[scanner] Fetching tree for ${owner}/${repo}@${branch} ...`);

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  const allBlobs = treeData.tree.filter(
    (item) => item.type === "blob" && typeof item.path === "string",
  );

  console.log(
    `[scanner] Tree: ${allBlobs.length} blobs, truncated=${treeData.truncated}`,
  );

  // ── Step 2: Scan all package.json files ───────────────────────────────────
  const pkgEntries = allBlobs.filter(
    (f) => f.path === "package.json" || f.path?.endsWith("/package.json")
  );

  console.log(`[scanner] Found ${pkgEntries.length} package.json files. Processing...`);

  const units: ScanUnit[] = [];

  for (const entry of pkgEntries) {
    try {
      const raw = await fetchFileContent(octokit, owner, repo, entry.path!, branch);
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      const hasStripeDependency = "stripe" in allDeps;
      const hasStripeJsDependency = "@stripe/stripe-js" in allDeps;

      if (hasStripeDependency || hasStripeJsDependency) {
        units.push({
          packageJsonPath: entry.path!,
          stripeVersion: allDeps["stripe"] ?? null,
          stripeJsVersion: allDeps["@stripe/stripe-js"] ?? null,
          hasStripeDependency,
          hasStripeJsDependency,
          files: [],
        });
        console.log(
          `[scanner] Found Stripe unit at ${entry.path!}: stripe=${allDeps["stripe"] ?? "none"}, stripe-js=${allDeps["@stripe/stripe-js"] ?? "none"}`
        );
      }
    } catch (err) {
      console.warn(`[scanner] Could not read/parse package.json at ${entry.path!}:`, err);
    }
  }

  // ── Step 3: Filter and scan source files ──────────────────────────────────
  const sourceFiles = allBlobs.filter((f) =>
    SCANNABLE_EXTENSIONS.has(fileExtension(f.path!)),
  );

  const scanTruncated = sourceFiles.length > MAX_FILES_PER_SCAN;
  const filesToScan = sourceFiles.slice(0, MAX_FILES_PER_SCAN);

  if (scanTruncated) {
    console.warn(
      `[scanner] ${sourceFiles.length} source files — scanning first ${MAX_FILES_PER_SCAN} only`,
    );
  }

  console.log(`[scanner] Scanning ${filesToScan.length} source files ...`);

  // ── Step 4: Batch-download and AST-inspect ────────────────────────────────
  const pkgPaths = units.map((u) => u.packageJsonPath);
  const matchedFiles: ScannedFile[] = [];

  for (let i = 0; i < filesToScan.length; i += FETCH_BATCH_SIZE) {
    const batch = filesToScan.slice(i, i + FETCH_BATCH_SIZE);

    const settled = await Promise.allSettled(
      batch.map(async (entry) => {
        const content = await fetchFileContent(
          octokit,
          owner,
          repo,
          entry.path!,
          branch,
        );

        const { hasServer, hasClient } = detectStripeImports(content, entry.path!);
        if (hasServer || hasClient) {
          const matchedType: "server" | "client" | "both" =
            hasServer && hasClient ? "both" : hasServer ? "server" : "client";

          const allCallSites = findStripeCallSites(content, entry.path!);
          let callSites = allCallSites;
          if (changes) {
            callSites = allCallSites.filter((site) =>
              changes.some((c) => isCallSiteAffected(site.methodPath, c))
            );
            // If changes are provided, only match files that contain affected call sites
            if (callSites.length === 0) {
              return null;
            }
          }

          const reason = `imports stripe (${matchedType} SDK)`;
          return {
            path: entry.path!,
            content,
            reason,
            matchedType,
            callSites,
          } satisfies ScannedFile;
        }
        return null;
      }),
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== null) {
        matchedFiles.push(result.value);
      } else if (result.status === "rejected") {
        console.warn("[scanner] Failed to fetch file:", result.reason);
      }
    }
  }

  // Group matched files into their respective scan units
  for (const file of matchedFiles) {
    const closestPkg = findClosestPkg(file.path, pkgPaths);
    if (closestPkg) {
      const unit = units.find((u) => u.packageJsonPath === closestPkg);
      if (unit) {
        unit.files.push(file);
      }
    }
  }

  // For backward compatibility, return root/primary unit values at top level
  const primaryUnit = units.find((u) => u.packageJsonPath === "package.json") ?? units[0];

  console.log(
    `[scanner] Done. ${matchedFiles.length} file(s) matched stripe out of ${filesToScan.length} scanned.`,
  );

  return {
    hasStripeDependency: primaryUnit?.hasStripeDependency ?? false,
    stripeVersion: primaryUnit?.stripeVersion ?? null,
    files: matchedFiles,
    scanTruncated,
    units,
  };
}

/**
 * True if an import specifier resolves to `packageName`.
 *
 * Two forms count as a match:
 *   - the bare package:      "express"            matches "express"
 *   - any subpath under it:  "express/lib/router" matches "express"
 *
 * Subpaths matter more than they look. `lodash/debounce`, `date-fns/format`,
 * and `firebase/auth` are the normal way those libraries are consumed, and an
 * exact-equality check silently skips every file that uses them — the patch
 * generator then never sees the code it is supposed to fix.
 *
 * The trailing slash is what keeps sibling packages apart: "react-dom" is not
 * equal to "react" and does not start with "react/", so it correctly fails.
 * Matching on a bare prefix would wrongly pull in react-dom, react-router,
 * and react-scripts whenever we scanned for react.
 *
 * Relative paths ("./x", "../x") and bare builtins ("fs") can never name a
 * dependency, so they fall out naturally.
 */
export function moduleSpecifierMatches(specifier: string, packageName: string): boolean {
  if (!specifier || !packageName) return false;
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

export function detectPackageImports(content: string, filePath: string, packageName: string): boolean {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  let hasImport = false;

  function isStringOrNoSubTemplate(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
  }

  function visit(node: ts.Node) {
    if (hasImport) return; // already decided — stop walking

    if (ts.isImportDeclaration(node)) {
      if (
        node.moduleSpecifier &&
        isStringOrNoSubTemplate(node.moduleSpecifier) &&
        moduleSpecifierMatches(node.moduleSpecifier.text, packageName)
      ) {
        hasImport = true;
      }
    } else if (ts.isExportDeclaration(node)) {
      if (
        node.moduleSpecifier &&
        isStringOrNoSubTemplate(node.moduleSpecifier) &&
        moduleSpecifierMatches(node.moduleSpecifier.text, packageName)
      ) {
        hasImport = true;
      }
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isRequire = ts.isIdentifier(expression) && expression.text === "require";
      const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;

      if (isRequire || isDynamicImport) {
        const firstArg = node.arguments[0];
        if (
          firstArg &&
          isStringOrNoSubTemplate(firstArg) &&
          moduleSpecifierMatches(firstArg.text, packageName)
        ) {
          hasImport = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hasImport;
}

export interface GenericScannedFile {
  path: string;
  content: string;
  reason: string;
}

export interface GenericScanResult {
  hasDependency: boolean;
  version: string | null;
  files: GenericScannedFile[];
  scanTruncated: boolean;
}

export async function scanRepoForPackageUsage(
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  packageName: string,
): Promise<GenericScanResult> {
  const octokit = await getInstallationOctokit(installationId);

  console.log(`[scanner] Fetching tree for ${owner}/${repo}@${branch} to scan for ${packageName}...`);

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  const allBlobs = treeData.tree.filter(
    (item) => item.type === "blob" && typeof item.path === "string",
  );

  const pkgEntries = allBlobs.filter(
    (f) => f.path === "package.json" || f.path?.endsWith("/package.json")
  );

  let hasDependency = false;
  let version: string | null = null;

  for (const entry of pkgEntries) {
    try {
      const raw = await fetchFileContent(octokit, owner, repo, entry.path!, branch);
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      if (packageName in allDeps) {
        hasDependency = true;
        version = allDeps[packageName] ?? null;
        break;
      }
    } catch (err) {
      console.warn(`[scanner] Could not read/parse package.json at ${entry.path!}:`, err);
    }
  }

  // Short-circuit: no manifest declares this package, so no file can import it
  // as a dependency. Skipping the scan saves up to MAX_FILES_PER_SCAN content
  // calls per repo — the difference between ~150 API calls and 0 on every repo
  // that simply doesn't use the package.
  if (!hasDependency) {
    console.log(`[scanner] ${packageName} not declared in any package.json — skipping file scan.`);
    return { hasDependency: false, version: null, files: [], scanTruncated: false };
  }

  const sourceFiles = allBlobs.filter((f) =>
    SCANNABLE_EXTENSIONS.has(fileExtension(f.path!)),
  );

  const scanTruncated = sourceFiles.length > MAX_FILES_PER_SCAN;
  const filesToScan = sourceFiles.slice(0, MAX_FILES_PER_SCAN);

  const matchedFiles: GenericScannedFile[] = [];

  for (let i = 0; i < filesToScan.length; i += FETCH_BATCH_SIZE) {
    const batch = filesToScan.slice(i, i + FETCH_BATCH_SIZE);

    const settled = await Promise.allSettled(
      batch.map(async (entry) => {
        const content = await fetchFileContent(
          octokit,
          owner,
          repo,
          entry.path!,
          branch,
        );

        if (detectPackageImports(content, entry.path!, packageName)) {
          return {
            path: entry.path!,
            content,
            reason: `imports ${packageName}`,
          } satisfies GenericScannedFile;
        }
        return null;
      }),
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value !== null) {
        matchedFiles.push(result.value);
      } else if (result.status === "rejected") {
        console.warn("[scanner] Failed to fetch file:", result.reason);
      }
    }
  }

  return {
    hasDependency,
    version,
    files: matchedFiles,
    scanTruncated,
  };
}
