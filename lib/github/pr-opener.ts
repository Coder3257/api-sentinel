/**
 * lib/github/pr-opener.ts
 *
 * Piece 7 — turns a set of AI-generated patches into a real GitHub pull request
 * on the customer repo, using GitHub App installation auth.
 *
 * Two responsibilities, deliberately kept separate (mirrors how repo-scanner
 * separates GitHub work from persistence):
 *
 *   1. openFixPr()        — pure GitHub side. Creates a branch, commits every
 *                           patched file in ONE atomic commit via the Git Data
 *                           API, and opens a PR. Returns PR metadata. No DB.
 *
 *   2. recordPullRequest() — persistence side. Writes the returned PR metadata
 *                            to the `pull_requests` table in Supabase.
 *
 * Why the Git Data API (blob → tree → commit → ref) instead of the Contents
 * API: the Contents API commits one file at a time (one commit per file, extra
 * round-trips, non-atomic). The Git Data API lets us stage all patched files
 * into a single tree and land them as one clean commit — the right shape for a
 * multi-file migration fix.
 */

import { getInstallationOctokit } from "@/lib/github/app-auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PatchResult } from "@/lib/ai/patch-generator";
import type { SpecChange } from "@/lib/stripe/changelog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenPrInput {
  installationId: number;
  owner: string;
  repo: string;
  /** Branch to open the PR against (usually the repo default branch). */
  baseBranch: string;
  /** Patches produced by generatePatches(). Only `changed` ones are committed. */
  patches: PatchResult[];
  /** The spec changes that motivated this PR (for the PR body). */
  changes: SpecChange[];
  /** One-line human summary of the change set (for title + body). */
  changesSummary: string;
  /**
   * Optional. If provided, the PR is opened as a draft. Defaults to false.
   * Reserved for the deferred hybrid-validation gate (draft → checks → ready).
   */
  draft?: boolean;
}

export interface OpenPrResult {
  /** GitHub's numeric PR id (the `id` field, not the human `number`). */
  githubPrId: number;
  /** The human-facing PR number, e.g. #42. */
  prNumber: number;
  prUrl: string;
  branchName: string;
  /** Files actually committed (the ones that changed). */
  committedFiles: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Committer/author identity shown on the commit. */
const BOT_NAME = "api-sentinel[bot]";
const BOT_EMAIL = "bot@apisentinel.dev";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OctokitInstance = Awaited<ReturnType<typeof getInstallationOctokit>>;

/** Unique, sortable branch name. e.g. api-sentinel/stripe-fix-1722268800000 */
function makeBranchName(): string {
  return `api-sentinel/stripe-fix-${Date.now()}`;
}

/** Short title from the change summary, safely truncated for a PR title. */
function makePrTitle(summary: string): string {
  const base = summary.trim().replace(/\s+/g, " ");
  const oneLine = base.length > 68 ? `${base.slice(0, 65)}...` : base;
  return `fix: ${oneLine}`;
}

/** Builds a structured, reviewable PR body from the changes + per-file reasoning. */
function makePrBody(
  changes: SpecChange[],
  changesSummary: string,
  patches: PatchResult[],
): string {
  const changed = patches.filter((p) => p.changed);

  const changeLines = changes
    .map((c) => `- **${c.type}** — \`${c.location}\`: ${c.description}`)
    .join("\n");

  const fileSections = changed
    .map(
      (p) =>
        `#### \`${p.filePath}\`\n${p.reasoning.trim()}`,
    )
    .join("\n\n");

  return [
    `## What changed in Stripe`,
    ``,
    changesSummary.trim(),
    ``,
    changeLines || "_No structured change list provided._",
    ``,
    `## Fix`,
    ``,
    `API Sentinel updated ${changed.length} file${changed.length === 1 ? "" : "s"} to stay compatible with the change above.`,
    ``,
    fileSections || "_No file-level detail available._",
    ``,
    `---`,
    ``,
    `_Opened automatically by ${BOT_NAME}. Review the diff and merge if it looks right — nothing is merged without you._`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// GitHub side
// ---------------------------------------------------------------------------

/**
 * Creates a branch, commits all changed patches as one atomic commit, and opens
 * a PR. Throws on failure (caller decides how to record the error). Does NOT
 * touch the database.
 */
export async function openFixPr(input: OpenPrInput): Promise<OpenPrResult> {
  const {
    installationId,
    owner,
    repo,
    baseBranch,
    patches,
    changes,
    changesSummary,
    draft = false,
  } = input;

  const changedPatches = patches.filter((p) => p.changed);
  if (changedPatches.length === 0) {
    throw new Error("openFixPr called with no changed files — nothing to commit");
  }

  const octokit = await getInstallationOctokit(installationId);
  const branchName = makeBranchName();

  console.log(
    `[pr-opener] ${owner}/${repo}: opening ${draft ? "draft " : ""}PR "${branchName}" with ${changedPatches.length} file(s)`,
  );

  // ── Step 1: Resolve the base branch head commit ───────────────────────────
  const { data: baseRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseCommitSha = baseRef.object.sha;

  const { data: baseCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = baseCommit.tree.sha;

  // ── Step 2: Create a blob for each patched file ───────────────────────────
  const treeItems = await Promise.all(
    changedPatches.map(async (patch) => {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(patch.patchedContent, "utf8").toString("base64"),
        encoding: "base64",
      });
      return {
        path: patch.filePath,
        mode: "100644" as const, // regular file
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  // ── Step 3: New tree on top of the base tree ──────────────────────────────
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // ── Step 4: Commit ────────────────────────────────────────────────────────
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: `${makePrTitle(changesSummary)}\n\nAuto-generated by API Sentinel.`,
    tree: newTree.sha,
    parents: [baseCommitSha],
    author: { name: BOT_NAME, email: BOT_EMAIL },
    committer: { name: BOT_NAME, email: BOT_EMAIL },
  });

  // ── Step 5: Create the branch ref pointing at the new commit ──────────────
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: newCommit.sha,
  });

  // ── Step 6: Open the PR ───────────────────────────────────────────────────
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: makePrTitle(changesSummary),
    head: branchName,
    base: baseBranch,
    body: makePrBody(changes, changesSummary, patches),
    draft,
  });

  console.log(`[pr-opener] Opened PR #${pr.number}: ${pr.html_url}`);

  return {
    githubPrId: pr.id,
    prNumber: pr.number,
    prUrl: pr.html_url,
    branchName,
    committedFiles: changedPatches.map((p) => p.filePath),
  };
}

// ---------------------------------------------------------------------------
// Persistence side
// ---------------------------------------------------------------------------

/**
 * Records an opened PR in the `pull_requests` table. Separate from openFixPr so
 * GitHub work and DB work fail independently and can be tested in isolation.
 *
 * @param scanId  The `scans.id` this PR belongs to.
 * @returns the inserted row id.
 */
export async function recordPullRequest(
  scanId: string,
  pr: OpenPrResult,
): Promise<string> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("pull_requests")
    .insert({
      scan_id: scanId,
      github_pr_id: pr.githubPrId,
      pr_url: pr.prUrl,
      branch_name: pr.branchName,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to record pull request: ${error.message}`);
  }

  return data.id as string;
}

/**
 * Convenience wrapper: open the PR on GitHub, then record it in Supabase.
 * If `scanId` is provided, the PR row is persisted; otherwise only GitHub is
 * touched (useful for the dev test script that has no scan row).
 */
export async function openAndRecordFixPr(
  input: OpenPrInput,
  scanId?: string,
): Promise<OpenPrResult & { pullRequestRowId?: string }> {
  const result = await openFixPr(input);
  if (!scanId) return result;
  const pullRequestRowId = await recordPullRequest(scanId, result);
  return { ...result, pullRequestRowId };
}
