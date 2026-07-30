/**
 * lib/dashboard/queries.ts
 *
 * Server-only read queries that power the /dashboard page. All use the
 * service-role Supabase client, so this file must never be imported from a
 * client component.
 *
 * Each query is defensive: on error it logs and returns an empty result rather
 * than throwing, so one broken query never blanks the whole dashboard.
 */

import { getSupabaseClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types (shaped for the UI, not 1:1 with DB rows)
// ---------------------------------------------------------------------------

export interface DashboardRepo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  installationId: number;
  createdAt: string;
}

export interface DashboardScan {
  id: string;
  repo: string; // "owner/name"
  changelogTitle: string;
  changelogEntryId: string;
  severity: string;
  status: string;
  affectedFileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPr {
  id: string;
  prUrl: string | null;
  branchName: string;
  status: string;
  githubPrId: number | null;
  createdAt: string;
}

export interface DashboardData {
  repos: DashboardRepo[];
  scans: DashboardScan[];
  pullRequests: DashboardPr[];
  stats: {
    repoCount: number;
    prCount: number;
    breakingScans: number;
    lastScanAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Individual queries
// ---------------------------------------------------------------------------

async function getRepos(): Promise<DashboardRepo[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("repos")
    .select("id, owner, name, default_branch, installation_id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dashboard] getRepos failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    owner: r.owner as string,
    name: r.name as string,
    defaultBranch: r.default_branch as string,
    installationId: r.installation_id as number,
    createdAt: r.created_at as string,
  }));
}

// Row shape from the scans join below.
interface ScanJoinRow {
  id: string;
  status: string;
  affected_files: unknown;
  created_at: string;
  updated_at: string;
  repos: { owner: string; name: string } | null;
  stripe_changelogs: {
    title: string;
    entry_id: string;
    severity: string;
  } | null;
}

async function getRecentScans(limit = 25): Promise<DashboardScan[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("scans")
    .select(
      `id, status, affected_files, created_at, updated_at,
       repos ( owner, name ),
       stripe_changelogs ( title, entry_id, severity )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[dashboard] getRecentScans failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as ScanJoinRow[];
  return rows.map((s) => {
    const affected = Array.isArray(s.affected_files) ? s.affected_files : [];
    return {
      id: s.id,
      repo: s.repos ? `${s.repos.owner}/${s.repos.name}` : "unknown",
      changelogTitle: s.stripe_changelogs?.title ?? "—",
      changelogEntryId: s.stripe_changelogs?.entry_id ?? "—",
      severity: s.stripe_changelogs?.severity ?? "unknown",
      status: s.status,
      affectedFileCount: affected.length,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };
  });
}

async function getRecentPrs(limit = 25): Promise<DashboardPr[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pull_requests")
    .select("id, pr_url, branch_name, status, github_pr_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[dashboard] getRecentPrs failed:", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    prUrl: (p.pr_url as string | null) ?? null,
    branchName: p.branch_name as string,
    status: p.status as string,
    githubPrId: (p.github_pr_id as number | null) ?? null,
    createdAt: p.created_at as string,
  }));
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * Fetches everything the dashboard needs in parallel and derives summary stats.
 * Never throws — a failed sub-query degrades to an empty section.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [repos, scans, pullRequests] = await Promise.all([
    getRepos(),
    getRecentScans(),
    getRecentPrs(),
  ]);

  const breakingScans = scans.filter((s) => s.severity === "breaking").length;
  const lastScanAt = scans.length > 0 ? scans[0].createdAt : null;

  return {
    repos,
    scans,
    pullRequests,
    stats: {
      repoCount: repos.length,
      prCount: pullRequests.length,
      breakingScans,
      lastScanAt,
    },
  };
}
