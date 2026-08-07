import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Fetch the 10 most recent scans for the user's repos
    const { data: scans, error } = await supabase
      .from("scans")
      .select(`
        id,
        status,
        error,
        created_at,
        updated_at,
        repos!inner (
          owner,
          name,
          user_id
        ),
        upgrade_candidates (
          repo_dependencies (
            package_name
          )
        ),
        pull_requests (
          pr_url
        )
      `)
      .eq("repos.user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (scans || []).map((scan: any) => {
      const repo = `${scan.repos?.owner}/${scan.repos?.name}`;
      const prUrl = scan.pull_requests && scan.pull_requests.length > 0 ? scan.pull_requests[0].pr_url : null;
      
      let packageName = "stripe";
      if (scan.upgrade_candidates?.repo_dependencies?.package_name) {
        packageName = scan.upgrade_candidates.repo_dependencies.package_name;
      }

      const trigger = scan.upgrade_candidates ? "upgrade" : "stripe";

      return {
        scanId: scan.id,
        repo,
        packageName,
        trigger,
        status: scan.status,
        error: scan.error,
        prUrl,
        createdAt: scan.created_at,
        updatedAt: scan.updated_at
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
