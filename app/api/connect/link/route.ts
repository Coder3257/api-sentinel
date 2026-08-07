import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runPipelineFromDb } from "@/lib/pipeline/run-pipeline";
import { runDependencyScan } from "@/lib/pipeline/run-dependency-scan";
import { runDependencyScanPipeline } from "@/lib/pipeline/run-dependency-scan-pipeline";
import { waitUntil } from "@vercel/functions";

/**
 * Allow the background pipeline work to keep running after the response
 * returns. On Vercel Hobby this buys us time up to the function's maxDuration;
 * it does NOT increase the 60-second cap. Without the git clone + npm install
 * step the per-repo path is: changelog fetch → Gemini patch → GitHub PR open,
 * which fits comfortably in 30 s for small repos.
 */
export const maxDuration = 30; // seconds

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    console.log("[DIAGNOSTIC] Session found in /api/connect/link:", JSON.stringify(session));

    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { installation_id } = body;

    if (!installation_id) {
      return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Check if the repos exist for this installation_id
    const { data: existingRepos, error: selectError } = await supabase
      .from("repos")
      .select("id, github_repo_id")
      .eq("installation_id", parseInt(installation_id));

    if (selectError) {
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (!existingRepos || existingRepos.length === 0) {
      return NextResponse.json(
        { error: "No repositories found for this installation yet. Please retry in a few seconds." },
        { status: 404 },
      );
    }

    // Update the repos with user_id
    const { error: updateError } = await supabase
      .from("repos")
      .update({ user_id: userId })
      .eq("installation_id", parseInt(installation_id));

    if (updateError) {
      return NextResponse.json({ error: "Failed to link repositories" }, { status: 500 });
    }

    // Kick off background initial scans for each newly-linked repo.
    for (const repo of existingRepos) {
      const repoId = repo.id as string;
      waitUntil(
        (async () => {
          try {
            console.log(`[connect/link] Starting initial scans for repo ${repoId}`);
            // 1. Scan for dependency upgrades
            await runDependencyScan(repoId);
            // 2. Process dependency upgrade pipeline
            await runDependencyScanPipeline();
            // 3. Process Stripe/main pipeline
            await runPipelineFromDb(repoId);
          } catch (err) {
            console.error(
              `[connect/link] Background initial scans failed for repo ${repoId}:`,
              err instanceof Error ? err.message : String(err),
            );
          }
        })()
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
