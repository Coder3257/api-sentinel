/**
 * lib/pipeline/run-pipeline.ts
 *
 * Piece 8 — the end-to-end orchestrator that ties Pieces 3–7 together.
 *
 * Flow (once per invocation, typically from the daily cron):
 *
 *   1. Fetch new Stripe OpenAPI changelog entries since the last one we saw
 *      (lib/stripe/changelog.ts). Persist each to `stripe_changelogs`.
 *   2. Load every installed customer repo from `repos`.
 *   3. For each (repo × new breaking/deprecation entry):
 *        a. Create/resume a `scans` row (dedup via UNIQUE(repo_id, changelog_id)).
 *        b. Scan the repo for Stripe SDK usage (lib/github/repo-scanner.ts).
 *           - No stripe dep / no matching files → mark scan `skipped`.
 *        c. Generate patches for the affected files (lib/ai/patch-generator.ts).
 *           - No file actually changed → mark scan `done` (nothing to PR).
 *        d. Open + record a PR (lib/github/pr-opener.ts) → mark scan `done`.
 *      Any thrown error → mark that scan `failed` with the message, then move on.
 *
 * Design choices (defaults chosen autonomously — noted in HANDOFF.md):
 *  - Only `breaking` and `deprecation` entries trigger scans. `additive` changes
 *    can't break a build, so we persist them for the record but never open PRs.
 *  - `scans` rows are the unit of idempotency + observability: the UNIQUE
 *    (repo_id, changelog_id) constraint means re-running the cron won't double-
 *    scan or double-PR a pair that already reached a terminal state.
 *  - One repo/entry failure never aborts the whole run — each is isolated in a
 *    try/catch and recorded on its own scan row.
 *  - The orchestrator is pure library code (no Request/Response), so it can be
 *    driven by the cron route, a dev route, or a test script identically.
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import {
  fetchNewChangelogEntries,
  type ChangelogEntry,
} from "@/lib/stripe/changelog";
import { scanRepoForStripeUsage, isCallSiteAffected } from "@/lib/github/repo-scanner";
import { generatePatches, type PatchInput } from "@/lib/ai/patch-generator";
import { openFixPr, recordPullRequest } from "@/lib/github/pr-opener";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RepoRow {
  id: string;
  github_repo_id: number;
  owner: string;
  name: string;
  installation_id: number;
  default_branch: string;
  user_id?: string | null;
}

/** Terminal (or in-flight) state recorded for one repo × entry pairing. */
export type ScanOutcome =
  | "skipped"    // no stripe usage in this repo
  | "no_change"  // patched but nothing actually changed → no PR
  | "pr_opened"  // PR successfully opened
  | "failed";    // an error was recorded on the scan row

export interface ScanReport {
  repo: string; // "owner/name"
  changelogEntryId: string; // e.g. "v2348"
  severity: string;
  outcome: ScanOutcome;
  scanId?: string;
  prUrl?: string;
  prNumber?: number;
  filesScanned?: number;
  filesChanged?: number;
  error?: string;
}

export interface PipelineResult {
  newChangelogEntries: number;
  actionableEntries: number; // breaking + deprecation
  reposProcessed: number;
  prsOpened: number;
  scans: ScanReport[];
  /** True when this was the first-ever run (baseline recorded, no diffs yet). */
  baselineOnly: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Only breaking + deprecation entries are worth scanning/patching for. */
function isActionable(entry: ChangelogEntry): boolean {
  return entry.severity === "breaking" || entry.severity === "deprecation";
}

/** Build a one-line human summary of a change set for the AI + PR title. */
function summariseChanges(entry: ChangelogEntry): string {
  const n = entry.breakingChanges.length;
  const head = entry.breakingChanges[0];
  const lead = head ? head.description : entry.title;
  return n <= 1
    ? `Stripe ${entry.entryId}: ${lead}`
    : `Stripe ${entry.entryId}: ${lead} (+${n - 1} more change${n - 1 === 1 ? "" : "s"})`;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

type Supabase = ReturnType<typeof getSupabaseClient>;

/**
 * Persist a changelog entry (idempotent on entry_id) and return its DB row id.
 * If the entry already exists we just fetch its id.
 */
async function upsertChangelog(
  supabase: Supabase,
  entry: ChangelogEntry,
): Promise<string> {
  const { data, error } = await supabase
    .from("stripe_changelogs")
    .upsert(
      {
        entry_id: entry.entryId,
        title: entry.title,
        published_at: entry.publishedAt.toISOString(),
        severity: entry.severity,
        raw_diff: entry.rawDiff,
      },
      { onConflict: "entry_id" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to upsert changelog ${entry.entryId}: ${error.message}`);
  }
  return data.id as string;
}

/**
 * Get-or-create a scans row for (repo, changelog). Idempotent via the
 * UNIQUE(repo_id, changelog_id) constraint. Returns { id, status }.
 * If a row already reached a terminal state, the caller can decide to skip.
 */
async function getOrCreateScan(
  supabase: Supabase,
  repoId: string,
  changelogId: string,
): Promise<{ id: string; status: string; created: boolean }> {
  // Try to insert; on conflict, fetch the existing row.
  const { data: inserted, error: insertErr } = await supabase
    .from("scans")
    .insert({ repo_id: repoId, changelog_id: changelogId, status: "pending" })
    .select("id, status")
    .single();

  if (!insertErr && inserted) {
    return { id: inserted.id as string, status: inserted.status as string, created: true };
  }

  // Conflict (or other error): fetch the existing row.
  const { data: existing, error: fetchErr } = await supabase
    .from("scans")
    .select("id, status")
    .eq("repo_id", repoId)
    .eq("changelog_id", changelogId)
    .single();

  if (fetchErr || !existing) {
    throw new Error(
      `Failed to create/fetch scan for repo=${repoId} changelog=${changelogId}: ${
        insertErr?.message ?? fetchErr?.message ?? "unknown"
      }`,
    );
  }
  return { id: existing.id as string, status: existing.status as string, created: false };
}

async function setScanStatus(
  supabase: Supabase,
  scanId: string,
  status: string,
  patch?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("scans")
    .update({ status, ...(patch ?? {}) })
    .eq("id", scanId);
  if (error) {
    // Don't throw from a status write — log and continue; the pipeline result
    // still reflects the true outcome.
    console.error(`[pipeline] Failed to set scan ${scanId} → ${status}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Per-repo processing
// ---------------------------------------------------------------------------

async function processRepoForEntry(
  supabase: Supabase,
  repo: RepoRow,
  changelogId: string,
  entry: ChangelogEntry,
): Promise<ScanReport> {
  const repoLabel = `${repo.owner}/${repo.name}`;
  const base: ScanReport = {
    repo: repoLabel,
    changelogEntryId: entry.entryId,
    severity: entry.severity,
    outcome: "failed",
  };

  const scan = await getOrCreateScan(supabase, repo.id, changelogId);
  base.scanId = scan.id;

  // Already finished this pair on a previous run → don't redo work.
  if (!scan.created && (scan.status === "done" || scan.status === "skipped")) {
    console.log(
      `[pipeline] ${repoLabel} × ${entry.entryId}: already ${scan.status}, skipping`,
    );
    return { ...base, outcome: scan.status === "skipped" ? "skipped" : "no_change" };
  }

  try {
    // ── Scan ────────────────────────────────────────────────────────────────
    await setScanStatus(supabase, scan.id, "scanning");
    const scanResult = await scanRepoForStripeUsage(
      repo.installation_id,
      repo.owner,
      repo.name,
      repo.default_branch,
      entry.breakingChanges,
    );
    base.filesScanned = scanResult.files.length;

    if (scanResult.files.length === 0) {
      await setScanStatus(supabase, scan.id, "skipped", {
        affected_files: [],
      });
      return { ...base, outcome: "skipped" };
    }

    // ── Patch ─────────────────────────────────────────────────────────────────
    await setScanStatus(supabase, scan.id, "patching", {
      affected_files: scanResult.files.map((f) => ({ path: f.path, reason: f.reason })),
    });

    const changesSummary = summariseChanges(entry);
    const patchInputs: PatchInput[] = scanResult.files.map((f) => {
      const callSitesInput = f.callSites.map((site) => {
        const matchingChange = entry.breakingChanges.find((c) =>
          isCallSiteAffected(site.methodPath, c)
        );
        return {
          methodPath: site.methodPath,
          lineNumber: site.lineNumber,
          snippet: site.snippet,
          changeDescription: matchingChange?.description ?? entry.title,
        };
      });

      return {
        changes: entry.breakingChanges,
        changesSummary,
        file: { path: f.path, content: f.content },
        callSites: callSitesInput,
      };
    });

    const patches = await generatePatches(patchInputs);
    // Tag reasoning with matched SDK Type and map callSites to PatchResult
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const input = patchInputs[i];
      const matchedFile = scanResult.files.find((f) => f.path === p.filePath);
      if (matchedFile) {
        p.reasoning = `**SDK Type**: ${matchedFile.matchedType}\n\n${p.reasoning}`;
      }
      p.callSites = input.callSites?.map((cs) => ({
        methodPath: cs.methodPath,
        lineNumber: cs.lineNumber,
      }));
    }

    const changed = patches.filter((p) => p.changed);
    base.filesChanged = changed.length;

    if (changed.length === 0) {
      await setScanStatus(supabase, scan.id, "done", {
        patch_result: patches.map((p) => ({
          filePath: p.filePath,
          reasoning: p.reasoning,
          changed: p.changed,
        })),
      });
      return { ...base, outcome: "no_change" };
    }

    // ── PR ────────────────────────────────────────────────────────────────────
    // In-pipeline verification (git clone + npm install + test/build) has been
    // removed: serverless functions cap out at 60 s (Hobby) / 300 s (Pro), and
    // a clone + cold npm install alone typically takes 45–120 s, leaving no
    // headroom for the Gemini call and PR creation. Verification responsibility
    // belongs in the user's own CI (GitHub Actions, etc.) which runs after the
    // draft PR is opened. The PR body says so explicitly.
    const pr = await openFixPr({
      installationId: repo.installation_id,
      owner: repo.owner,
      repo: repo.name,
      baseBranch: repo.default_branch,
      patches,
      changes: entry.breakingChanges,
      changesSummary,
    });

    await recordPullRequest(scan.id, pr);
    await setScanStatus(supabase, scan.id, "done", {
      patch_result: patches.map((p) => ({
        filePath: p.filePath,
        patchedContent: p.changed ? p.patchedContent : undefined,
        reasoning: p.reasoning,
        changed: p.changed,
      })),
    });

    if (repo.user_id) {
      try {
        const { data: userData } = await supabase
          .from("users")
          .select("email")
          .eq("id", repo.user_id)
          .maybeSingle();

        if (userData?.email) {
          const { sendPrOpenedEmail } = await import("@/lib/email/notify");
          await sendPrOpenedEmail(userData.email, repoLabel, pr.prUrl);
        }
      } catch (emailErr) {
        console.error(`[pipeline] Failed to send email alert for ${repoLabel}:`, emailErr);
      }

      // Fire-and-forget Webhook Notification
      try {
        const { triggerWebhookIfNeeded } = await import("@/lib/webhook/notify");
        triggerWebhookIfNeeded(repo.user_id, repo.id, {
          repoId: repo.id,
          repoName: repoLabel,
          scanId: scan.id,
          prUrl: pr.prUrl,
          status: "done",
          timestamp: new Date().toISOString(),
        }).catch((err) => {
          console.error(`[pipeline] Webhook trigger error for ${repoLabel}:`, err);
        });
      } catch (webhookErr) {
        console.error(`[pipeline] Failed to initialize webhook trigger for ${repoLabel}:`, webhookErr);
      }
    }


    return {
      ...base,
      outcome: "pr_opened",
      prUrl: pr.prUrl,
      prNumber: pr.prNumber,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] ${repoLabel} × ${entry.entryId} failed:`, message);
    console.error(`[ALERT] Pipeline scan failed: scanId=${scan.id} entryId=${entry.entryId} repo=${repoLabel} error="${message}"`);
    await setScanStatus(supabase, scan.id, "failed", { error: message });
    return { ...base, outcome: "failed", error: message };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Runs the full scan→patch→PR pipeline once.
 *
 * @param lastSeenEntryId  The entry_id of the newest changelog we've already
 *   processed. Pass null on the first ever run to establish a baseline (records
 *   the latest tag, opens no PRs). In production the cron reads this from the
 *   most recent `stripe_changelogs` row.
 * @param repoId  Optional. When set, scope the scan to this single DB repo id.
 *   Used by the connect route to trigger an immediate scan for a newly-linked
 *   repo without waiting for the daily cron.
 */
export async function runPipeline(
  lastSeenEntryId: string | null,
  repoId?: string,
): Promise<PipelineResult> {
  const supabase = getSupabaseClient();

  console.log(
    `[pipeline] Starting run. lastSeenEntryId=${lastSeenEntryId ?? "(none — baseline)"}${
      repoId ? ` repoId=${repoId}` : ""
    }`,
  );

  // ── Step 1: new changelog entries ──────────────────────────────────────────
  const entries = await fetchNewChangelogEntries(lastSeenEntryId);

  const result: PipelineResult = {
    newChangelogEntries: entries.length,
    actionableEntries: 0,
    reposProcessed: 0,
    prsOpened: 0,
    scans: [],
    baselineOnly: lastSeenEntryId === null,
  };

  if (entries.length === 0) {
    console.log("[pipeline] No new changelog entries. Nothing to do.");
    return result;
  }

  // Persist all entries (even additive — good record), collect their DB ids.
  const entryIds = new Map<string, string>();
  for (const entry of entries) {
    entryIds.set(entry.entryId, await upsertChangelog(supabase, entry));
  }

  const actionable = entries.filter(isActionable);
  result.actionableEntries = actionable.length;

  if (actionable.length === 0) {
    console.log("[pipeline] New entries are all additive — no PRs needed.");
    return result;
  }

  // ── Step 2: load installed repos (optionally scoped to one) ─────────────────
  let reposQuery = supabase
    .from("repos")
    .select("id, github_repo_id, owner, name, installation_id, default_branch, user_id");

  if (repoId) {
    reposQuery = reposQuery.eq("id", repoId);
  }

  const { data: repos, error: reposErr } = await reposQuery;

  if (reposErr) {
    throw new Error(`Failed to load repos: ${reposErr.message}`);
  }
  const repoRows = (repos ?? []) as RepoRow[];
  result.reposProcessed = repoRows.length;

  if (repoRows.length === 0) {
    console.log("[pipeline] No installed repos. Nothing to scan.");
    return result;
  }

  // ── Step 3: repo × actionable entry ─────────────────────────────────────────
  for (const entry of actionable) {
    const changelogId = entryIds.get(entry.entryId)!;
    for (const repo of repoRows) {
      const report = await processRepoForEntry(supabase, repo, changelogId, entry);
      result.scans.push(report);
      if (report.outcome === "pr_opened") result.prsOpened += 1;
    }
  }

  console.log(
    `[pipeline] Done. entries=${result.newChangelogEntries} actionable=${result.actionableEntries} repos=${result.reposProcessed} PRs=${result.prsOpened}`,
  );

  return result;
}

/**
 * Convenience: read the last-seen entry id from the DB, then run.
 * The most recently published changelog row is our high-water mark.
 *
 * @param repoId  Optional. When set, scope the scan to this single DB repo id.
 */
export async function runPipelineFromDb(repoId?: string): Promise<PipelineResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("stripe_changelogs")
    .select("entry_id")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read last changelog entry: ${error.message}`);
  }

  const lastSeen = (data?.entry_id as string | undefined) ?? null;
  return runPipeline(lastSeen, repoId);
}
