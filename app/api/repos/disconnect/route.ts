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
    const { repoId } = body;

    if (!repoId) {
      return NextResponse.json({ error: "Missing repoId" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Verify the repo belongs to the current user
    const { data: repo, error: checkError } = await supabase
      .from("repos")
      .select("user_id")
      .eq("id", repoId)
      .single();

    if (checkError || !repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    if (repo.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this repository connection" }, { status: 403 });
    }

    // Unlink the repository from the user
    const { error: updateError } = await supabase
      .from("repos")
      .update({ user_id: null })
      .eq("id", repoId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to disconnect repository" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
