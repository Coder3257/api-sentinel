import { getSupabaseClient } from "@/lib/supabase/client";
import DashboardClient from "@/app/dashboard/DashboardClient";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

// Opt out of static caching so dashboard displays live database data.
export const revalidate = 0;

interface Repo {
  id: string;
  owner: string;
  name: string;
  default_branch?: string | null;
}

interface PullRequest {
  pr_url: string;
  status: string;
}

interface ScanRow {
  id: string;
  status: string;
  created_at: string;
  repos: Repo | Repo[] | null;
  pull_requests: PullRequest[] | null;
  trigger?: "stripe" | "upgrade" | "unknown";
}

/** The most recent scan for a repo, used to show in-progress / failed states on the repo card. */
export interface RepoScanStatus {
  repoId: string;
  status: string | null;
  error: string | null;
  created_at: string | null;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/");
  }

  const supabase = getSupabaseClient();
  const userId = (session.user as any).id;

  // Fetch counts, scans list, user repos, and per-repo latest scan status in parallel
  const [reposRes, scansRes, prsRes, mergedPrsRes, scansListRes, userReposRes, upgradeCandidatesRes] = await Promise.all([
    supabase.from("repos").select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("scans").select("id, repos!inner(user_id)", { count: "exact", head: true })
      .eq("repos.user_id", userId),
    supabase.from("pull_requests").select("id, scans!inner(repos!inner(user_id))", { count: "exact", head: true })
      .eq("scans.repos.user_id", userId),
    supabase.from("pull_requests").select("id, scans!inner(repos!inner(user_id))", { count: "exact", head: true })
      .eq("scans.repos.user_id", userId).eq("status", "merged"),
    supabase
      .from("scans")
      .select(`
        id,
        status,
        created_at,
        upgrade_candidate_id,
        changelog_id,
        repos!inner (
          id,
          owner,
          name,
          default_branch
        ),
        pull_requests (
          pr_url,
          status
        )
      `)
      .eq("repos.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("repos")
      .select("id, owner, name")
      .eq("user_id", userId),
    supabase
      .from("upgrade_candidates")
      .select(`
        id,
        from_version,
        to_version,
        created_at,
        repo_dependencies!inner (
          package_name,
          ecosystem,
          repos!inner (
            id,
            owner,
            name,
            user_id
          )
        ),
        scans (
          status,
          error,
          pull_requests (
            id
          )
        )
      `)
      .eq("repo_dependencies.repos.user_id", userId)
  ]);

  const totalRepos = reposRes.count || 0;
  const totalScans = scansRes.count || 0;
  const totalPRs = prsRes.count || 0;
  const mergedPRs = mergedPrsRes.count || 0;
  const rawScans = (scansListRes.data as unknown as any[]) || [];
  const scans: ScanRow[] = rawScans.map((s) => ({
    id: s.id,
    status: s.status,
    created_at: s.created_at,
    repos: s.repos,
    pull_requests: s.pull_requests,
    trigger: s.upgrade_candidate_id ? "upgrade" : (s.changelog_id ? "stripe" : "unknown"),
  }));
  const userRepos = (userReposRes.data as unknown as Repo[]) || [];
  const upgradeCandidates = (upgradeCandidatesRes.data as any[]) || [];

  // For each user repo, fetch its latest scan so we can show Scanning…/failed on the card.
  const repoScanStatuses: RepoScanStatus[] = [];
  if (userRepos.length > 0) {
    const repoIds = userRepos.map((r) => r.id);
    const { data: latestScans } = await supabase
      .from("scans")
      .select("repo_id, status, error, created_at")
      .in("repo_id", repoIds)
      .order("created_at", { ascending: false });

    // Keep only the most recent scan per repo
    const seen = new Set<string>();
    for (const row of latestScans ?? []) {
      const rid = row.repo_id as string;
      if (!seen.has(rid)) {
        seen.add(rid);
        repoScanStatuses.push({
          repoId: rid,
          status: (row.status as string) ?? null,
          error: (row.error as string) ?? null,
          created_at: (row.created_at as string) ?? null,
        });
      }
    }
  }

  return (
    <DashboardClient
      totalRepos={totalRepos}
      totalScans={totalScans}
      totalPRs={totalPRs}
      mergedPRs={mergedPRs}
      scans={scans}
      userRepos={userRepos}
      repoScanStatuses={repoScanStatuses}
      upgradeCandidates={upgradeCandidates}
    />
  );
}
