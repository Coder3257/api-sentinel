import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchReleaseNotes } from "@/lib/registry/release-notes";
import { scanRepoForPackageUsage } from "@/lib/github/repo-scanner";
import { generatePatches, type PatchInput } from "@/lib/ai/patch-generator";
import { openFixPr, recordPullRequest } from "@/lib/github/pr-opener";

interface RepoRow {
  id: string;
  owner: string;
  name: string;
  installation_id: number;
  default_branch: string;
  user_id?: string | null;
  plan?: string | null;
}

export type ScanOutcome =
  | "skipped"
  /** Repo is not on the Pro plan, so upgrade patching was not attempted. */
  | "not_entitled"
  /** Upgrade is real, but no usable release notes exist to patch from. */
  | "no_guidance"
  | "no_change"
  | "pr_opened"
  | "failed";

export interface ScanReport {
  repo: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  outcome: ScanOutcome;
  scanId?: string;
  prUrl?: string;
  error?: string;
}

export interface DependencyScanPipelineResult {
  scansProcessed: number;
  prsOpened: number;
  reports: ScanReport[];
}

type Supabase = ReturnType<typeof getSupabaseClient>;

async function setScanStatus(
  supabase: Supabase,
  scanId: string,
  status: string,
  patch?: Record<string, any>,
): Promise<void> {
  const { error } = await supabase
    .from("scans")
    .update({ status, ...(patch ?? {}) })
    .eq("id", scanId);
  if (error) {
    console.error(`[dep-pipeline] Failed to set scan ${scanId} → ${status}: ${error.message}`);
  }
}

export async function runDependencyScanPipeline(): Promise<DependencyScanPipelineResult> {
  const supabase = getSupabaseClient();
  
  console.log("[dep-pipeline] Starting dependency scan pipeline execution...");

  // Load all pending scans that are triggered by a dependency upgrade candidate
  const { data: scans, error: scansErr } = await supabase
    .from("scans")
    .select(`
      id,
      status,
      repo_id,
      upgrade_candidate_id,
      repos (
        id,
        owner,
        name,
        installation_id,
        default_branch,
        user_id,
        plan
      ),
      upgrade_candidates (
        id,
        from_version,
        to_version,
        dependency_id,
        repo_dependencies (
          package_name,
          ecosystem
        )
      )
    `)
    .eq("status", "pending")
    .not("upgrade_candidate_id", "is", null);

  if (scansErr) {
    throw new Error(`Failed to load pending dependency scans: ${scansErr.message}`);
  }

  const result: DependencyScanPipelineResult = {
    scansProcessed: scans?.length ?? 0,
    prsOpened: 0,
    reports: [],
  };

  if (!scans || scans.length === 0) {
    console.log("[dep-pipeline] No pending dependency scans found.");
    return result;
  }

  for (const scan of scans) {
    const scanId = scan.id;
    const repo = scan.repos as any as RepoRow;
    const candidate = scan.upgrade_candidates as any;
    
    if (!repo || !candidate || !candidate.repo_dependencies) {
      console.warn(`[dep-pipeline] Scan ${scanId} is missing related repo or candidate data.`);
      continue;
    }

    const packageName = candidate.repo_dependencies.package_name;
    const fromVersion = candidate.from_version;
    const toVersion = candidate.to_version;
    const repoLabel = `${repo.owner}/${repo.name}`;

    const report: ScanReport = {
      repo: repoLabel,
      packageName,
      fromVersion,
      toVersion,
      outcome: "failed",
      scanId,
    };

    // Dependency-upgrade patching is the paid tier. The Stripe pipeline stays
    // free for everyone; this one is gated. Anything other than an explicit
    // "pro" is treated as unentitled, so a NULL plan (a repo row that predates
    // migration 010, or one written by a path that forgot the column) fails
    // closed rather than handing out the paid feature.
    if (repo.plan !== "pro") {
      console.log(
        `[dep-pipeline] Repo ${repoLabel} on plan "${repo.plan ?? "free"}" — ` +
          "dependency upgrade patching is Pro-only. Skipping.",
      );
      await setScanStatus(supabase, scanId, "skipped", {
        error: "Dependency upgrade patching requires a Pro plan",
      });
      report.outcome = "not_entitled";
      result.reports.push(report);
      continue;
    }

    try {
      console.log(`[dep-pipeline] Processing scan ${scanId} for ${repoLabel} (package: ${packageName} ${fromVersion} → ${toVersion})`);
      
      await setScanStatus(supabase, scanId, "scanning");

      // 1. Fetch release notes
      const notesResult = await fetchReleaseNotes(packageName, fromVersion, toVersion);
      if (!notesResult || !notesResult.notes || notesResult.notes.length === 0) {
        // Not "skipped" — that lies about the scan. The upgrade is real and
        // confirmed; we simply have no usable migration guidance for it. This
        // is a known limit (migration 009), so the assistant and dashboard can
        // say "upgrade available — no migration guide found" instead of a lie.
        console.log(`[dep-pipeline] No usable release notes for ${packageName} ${fromVersion} → ${toVersion}. Marking no_guidance.`);
        await setScanStatus(supabase, scanId, "no_guidance", { error: "No usable release notes found" });
        report.outcome = "no_guidance";
        result.reports.push(report);
        continue;
      }

      // 2. Scan repo for imports of package
      const scanResult = await scanRepoForPackageUsage(
        repo.installation_id,
        repo.owner,
        repo.name,
        repo.default_branch,
        packageName
      );

      if (scanResult.files.length === 0) {
        console.log(`[dep-pipeline] No imports of ${packageName} found in source files of ${repoLabel}. Skipping.`);
        await setScanStatus(supabase, scanId, "skipped", { affected_files: [] });
        report.outcome = "skipped";
        result.reports.push(report);
        continue;
      }

      // 3. Generate patches
      await setScanStatus(supabase, scanId, "patching", {
        affected_files: scanResult.files.map((f) => ({ path: f.path, reason: f.reason })),
      });

      const notesText = notesResult.notes
        .map((n) => `### ${n.title} (${n.version})\n${n.body}`)
        .join("\n\n");

      const changesSummary = `Upgrade ${packageName} from ${fromVersion} to ${toVersion}`;

      const patchInputs: PatchInput[] = scanResult.files.map((f) => ({
        packageName,
        releaseNotes: notesText,
        changesSummary,
        file: { path: f.path, content: f.content },
      }));

      const patches = await generatePatches(patchInputs);
      const changed = patches.filter((p) => p.changed);

      if (changed.length === 0) {
        console.log(`[dep-pipeline] AI determined no code changes are required for ${packageName} upgrade in ${repoLabel}.`);
        await setScanStatus(supabase, scanId, "done", {
          patch_result: patches.map((p) => ({
            filePath: p.filePath,
            reasoning: p.reasoning,
            changed: p.changed,
          })),
        });
        report.outcome = "no_change";
        result.reports.push(report);
        continue;
      }

      // 4. Open PR
      const pr = await openFixPr({
        installationId: repo.installation_id,
        owner: repo.owner,
        repo: repo.name,
        baseBranch: repo.default_branch,
        patches,
        changesSummary,
        releaseNotes: notesText,
        packageName,
        draft: true, // draft PR
      });

      await recordPullRequest(scanId, pr);
      await setScanStatus(supabase, scanId, "done", {
        patch_result: patches.map((p) => ({
          filePath: p.filePath,
          patchedContent: p.changed ? p.patchedContent : undefined,
          reasoning: p.reasoning,
          changed: p.changed,
        })),
      });

      report.outcome = "pr_opened";
      report.prUrl = pr.prUrl;
      result.prsOpened += 1;
      result.reports.push(report);

      console.log(`[dep-pipeline] Successfully opened PR for ${packageName} upgrade in ${repoLabel}: ${pr.prUrl}`);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[dep-pipeline] Scan ${scanId} failed:`, message);
      console.error(`[ALERT] Pipeline scan failed: scanId=${scanId} package=${packageName} repo=${repoLabel} error="${message}"`);
      await setScanStatus(supabase, scanId, "failed", { error: message });
      report.outcome = "failed";
      report.error = message;
      result.reports.push(report);
    }
  }

  return result;
}
