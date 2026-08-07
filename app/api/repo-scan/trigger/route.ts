import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runPipelineFromDb } from "@/lib/pipeline/run-pipeline";
import { runDependencyScan } from "@/lib/pipeline/run-dependency-scan";
import { runDependencyScanPipeline } from "@/lib/pipeline/run-dependency-scan-pipeline";
import { waitUntil } from "@vercel/functions";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { repoId } = body;

    if (!repoId) {
      return NextResponse.json({ error: "Missing repoId" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Verify repo ownership
    const { data: repo, error: repoErr } = await supabase
      .from("repos")
      .select("id, user_id")
      .eq("id", repoId)
      .single();

    if (repoErr || !repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    if (repo.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this repository connection" }, { status: 403 });
    }

    // Rate limiting: check if a scan started in the last 60s
    const { data: recentScans } = await supabase
      .from("scans")
      .select("id, created_at")
      .eq("repo_id", repoId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentScans && recentScans.length > 0) {
      const lastScanTime = new Date(recentScans[0].created_at).getTime();
      const secondsSinceLastScan = Math.floor((Date.now() - lastScanTime) / 1000);
      if (secondsSinceLastScan < 60) {
        return NextResponse.json(
          { error: `Scan already running, wait ${60 - secondsSinceLastScan}s` },
          { status: 429 }
        );
      }
    }

    // Trigger existing pipelines in background
    waitUntil(
      (async () => {
        try {
          console.log(`[manual-trigger] Running dependency scan for repo ${repoId}`);
          await runDependencyScan(repoId);
          console.log(`[manual-trigger] Running dependency scan pipeline`);
          await runDependencyScanPipeline();
          console.log(`[manual-trigger] Running main OpenAPI pipeline for repo ${repoId}`);
          await runPipelineFromDb(repoId);
        } catch (err) {
          console.error(`[manual-trigger] Error running pipelines for repo ${repoId}:`, err);
        }
      })()
    );

    // Wait a brief moment for the database records to be inserted
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Fetch the latest scan row to return its ID and status
    const { data: latestScans } = await supabase
      .from("scans")
      .select("id, status")
      .eq("repo_id", repoId)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestScan = latestScans?.[0];

    return NextResponse.json({
      scanId: latestScan?.id || null,
      status: latestScan?.status || "pending",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
