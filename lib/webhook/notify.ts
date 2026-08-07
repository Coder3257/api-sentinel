import { getSupabaseClient } from "@/lib/supabase/client";

export async function triggerWebhookIfNeeded(
  userId: string,
  repoId: string,
  payload: {
    repoId: string;
    repoName: string;
    scanId: string;
    prUrl: string | null;
    status: string;
    timestamp: string;
  }
) {
  try {
    const supabase = getSupabaseClient();
    const { data: prefs, error } = await supabase
      .from("notification_prefs")
      .select("repo_id, webhook_enabled, webhook_url")
      .eq("user_id", userId);

    if (error || !prefs) {
      return;
    }

    const override = prefs.find((p) => p.repo_id === repoId);
    const globalPref = prefs.find((p) => p.repo_id === null);

    const webhookEnabled = override ? override.webhook_enabled : (globalPref ? globalPref.webhook_enabled : false);
    const webhookUrl = override ? override.webhook_url : (globalPref ? globalPref.webhook_url : null);

    if (webhookEnabled && webhookUrl && webhookUrl.startsWith("https://")) {
      console.log(`[WEBHOOK] Triggering webhook for repo ${repoId} to ${webhookUrl}`);
      // Fire-and-forget: do not await, catch errors to avoid blocking the pipeline
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error(`[WEBHOOK] Failed to post webhook:`, err);
      });
    }
  } catch (err) {
    console.error(`[WEBHOOK] Error checking webhook prefs:`, err);
  }
}
