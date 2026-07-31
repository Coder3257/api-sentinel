import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";

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
      .select("github_repo_id")
      .eq("installation_id", parseInt(installation_id));

    if (selectError) {
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (!existingRepos || existingRepos.length === 0) {
      return NextResponse.json({ error: "No repositories found for this installation yet. Please retry in a few seconds." }, { status: 404 });
    }

    // Update the repos with user_id
    const { error: updateError } = await supabase
      .from("repos")
      .update({ user_id: userId })
      .eq("installation_id", parseInt(installation_id));

    if (updateError) {
      return NextResponse.json({ error: "Failed to link repositories" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
