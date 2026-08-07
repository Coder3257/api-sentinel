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

    const { data: prefs, error } = await supabase
      .from("notification_prefs")
      .select("repo_id, email_enabled, webhook_url, webhook_enabled")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const globalPref = prefs?.find((p) => p.repo_id === null) || {
      email_enabled: true,
      webhook_enabled: false,
      webhook_url: null,
    };

    const overrides = (prefs || [])
      .filter((p) => p.repo_id !== null)
      .map((p) => ({
        repoId: p.repo_id,
        emailEnabled: p.email_enabled,
        webhookEnabled: p.webhook_enabled,
        webhookUrl: p.webhook_url,
      }));

    return NextResponse.json({
      global: {
        emailEnabled: globalPref.email_enabled,
        webhookEnabled: globalPref.webhook_enabled,
        webhookUrl: globalPref.webhook_url,
      },
      overrides,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { repoId, emailEnabled, webhookEnabled, webhookUrl } = body as {
      repoId: string | null;
      emailEnabled: boolean;
      webhookEnabled: boolean;
      webhookUrl: string | null;
    };

    if (webhookEnabled && (!webhookUrl || !webhookUrl.startsWith("https://"))) {
      return NextResponse.json(
        { error: "Webhook URL must start with https:// when enabled" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Verify ownership of the repository connection if repoId is provided
    if (repoId) {
      const { data: repo, error: repoErr } = await supabase
        .from("repos")
        .select("id, user_id")
        .eq("id", repoId)
        .single();

      if (repoErr || !repo) {
        return NextResponse.json({ error: "Repository connection not found" }, { status: 404 });
      }

      if (repo.user_id !== userId) {
        return NextResponse.json({ error: "Forbidden: You do not own this repository connection" }, { status: 403 });
      }
    }

    const { error: upsertErr } = await supabase
      .from("notification_prefs")
      .upsert(
        {
          user_id: userId,
          repo_id: repoId || null,
          email_enabled: emailEnabled,
          webhook_enabled: webhookEnabled,
          webhook_url: webhookUrl || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,repo_id",
        }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
