import { getSupabaseClient } from "@/lib/supabase/client";
import DashboardClient from "@/app/dashboard/DashboardClient";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

// Opt out of static caching so dashboard displays live database data.
export const revalidate = 0;

interface Repo {
  owner: string;
  name: string;
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
}

export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/");
  }

  const supabase = getSupabaseClient();
  const userId = (session.user as any).id;

  // Fetch counts, scans list, and user repos in parallel
  const [reposRes, scansRes, prsRes, scansListRes, userReposRes] = await Promise.all([
    supabase.from("repos").select("id", { count: "exact", head: true }),
    supabase.from("scans").select("id", { count: "exact", head: true }),
    supabase.from("pull_requests").select("id", { count: "exact", head: true }),
    supabase
      .from("scans")
      .select(`
        id,
        status,
        created_at,
        repos (
          owner,
          name
        ),
        pull_requests (
          pr_url,
          status
        )
      `)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("repos")
      .select("owner, name")
      .eq("user_id", userId)
  ]);

  const totalRepos = reposRes.count || 0;
  const totalScans = scansRes.count || 0;
  const totalPRs = prsRes.count || 0;
  const scans = (scansListRes.data as unknown as ScanRow[]) || [];
  const userRepos = (userReposRes.data as unknown as Repo[]) || [];

  return (
    <DashboardClient
      totalRepos={totalRepos}
      totalScans={totalScans}
      totalPRs={totalPRs}
      scans={scans}
      userRepos={userRepos}
    />
  );
}

