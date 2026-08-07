import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { candidateId } = body;

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Fetch candidate and join repo_dependencies + repos to verify user owns the repo
    const { data: candidate, error: fetchErr } = await supabase
      .from("upgrade_candidates")
      .select(`
        id,
        dependency_id,
        repo_dependencies!inner (
          repo_id,
          repos!inner (
            id,
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
    const repoId = repoDep?.repo_id;

    if (!repo || repo.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this repository connection" }, { status: 403 });
    }

    // Check if scan already exists for this candidate
    const { data: existingScan } = await supabase
      .from("scans")
      .select("id")
      .eq("repo_id", repoId)
      .eq("upgrade_candidate_id", candidateId)
      .maybeSingle();

    let scanId = "";

    if (existingScan) {
      const { error: updateError } = await supabase
        .from("scans")
        .update({
          status: "pending",
          error: null,
          affected_files: null,
          patch_result: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingScan.id);

      if (updateError) {
        return NextResponse.json({ error: "Failed to update scan status" }, { status: 500 });
      }
      scanId = existingScan.id;
    } else {
      const { data: newScan, error: insertError } = await supabase
        .from("scans")
        .insert({
          repo_id: repoId,
          upgrade_candidate_id: candidateId,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !newScan) {
        return NextResponse.json({ error: "Failed to trigger scan" }, { status: 500 });
      }
      scanId = newScan.id;
    }

    return NextResponse.json({ ok: true, scanId });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
