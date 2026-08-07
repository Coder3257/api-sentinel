import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchReleaseNotes } from "@/lib/registry/release-notes";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get("candidateId");

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Fetch candidate and verify user ownership of the repository
    const { data: candidate, error: fetchErr } = await supabase
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
        )
      `)
      .eq("id", candidateId)
      .single();

    if (fetchErr || !candidate) {
      return NextResponse.json({ error: "Upgrade candidate not found" }, { status: 404 });
    }

    const repoDep = candidate.repo_dependencies as any;
    const repo = repoDep?.repos;

    if (!repo || repo.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this repository connection" }, { status: 403 });
    }

    // Fetch the scan and associated pull requests if they exist
    const { data: scan } = await supabase
      .from("scans")
      .select(`
        id,
        status,
        error,
        affected_files,
        patch_result,
        created_at,
        pull_requests (
          id,
          pr_url,
          status,
          created_at
        )
      `)
      .eq("upgrade_candidate_id", candidateId)
      .maybeSingle();

    // Fetch release notes on demand
    const notesResult = await fetchReleaseNotes(
      repoDep.package_name,
      candidate.from_version,
      candidate.to_version
    );

    const pr = scan?.pull_requests && scan.pull_requests.length > 0 ? scan.pull_requests[0] : null;

    return NextResponse.json({
      candidate,
      scan: scan ? {
        id: scan.id,
        status: scan.status,
        error: scan.error,
        affected_files: scan.affected_files,
        patch_result: scan.patch_result,
        created_at: scan.created_at,
      } : null,
      pr,
      releaseNotes: notesResult ? notesResult.notes : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
