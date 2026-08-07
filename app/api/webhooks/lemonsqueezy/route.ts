import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

/** Subset of the LS payload we actually read. */
interface LsPayload {
  meta?: {
    event_name?: string;
    custom_data?: { repo_id?: string };
  };
  data?: {
    id?: string; // subscription id
    attributes?: { status?: string; first_order_item?: { subscription_id?: string } };
  };
}

async function resolveRepoId(payload: LsPayload, supabase: ReturnType<typeof getSupabaseClient>): Promise<string | null> {
  // 1. Checkout-driven events carry repo_id in custom_data.
  const customId = payload.meta?.custom_data?.repo_id;
  if (customId) return customId;

  // 2. For self-generated LS events (dunning expiry, admin cancellation),
  //    look up the repo by the stored subscription id.
  const subscriptionId = payload.data?.id ?? payload.data?.attributes?.first_order_item?.subscription_id;
  if (!subscriptionId) return null;

  const { data, error } = await supabase
    .from("repos")
    .select("id")
    .eq("lemonsqueezy_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) {
    console.error("[lemonsqueezy-webhook] subscription lookup failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function persistSubscriptionId(
  repoId: string,
  subscriptionId: string,
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<void> {
  const { error } = await supabase
    .from("repos")
    .update({ lemonsqueezy_subscription_id: subscriptionId })
    .eq("id", repoId);

  if (error) {
    // Not fatal — the repo stays pro but future lookups won't work.
    console.error("[lemonsqueezy-webhook] Failed to persist subscription id:", error.message);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-signature") || "";
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

    if (!secret) {
      console.error("[lemonsqueezy-webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set");
      return new Response("Server misconfiguration", { status: 500 });
    }

    const expected = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.warn("[lemonsqueezy-webhook] Signature verification failed");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = JSON.parse(rawBody) as LsPayload;
    const eventName = payload.meta?.event_name;
    const supabase = getSupabaseClient();

    const repoId = await resolveRepoId(payload, supabase);

    console.log(`[lemonsqueezy-webhook] event="${eventName}" repoId=${repoId}`);
    if (!repoId) {
      console.warn("[lemonsqueezy-webhook] Could not resolve repo id — event ignored.");
      return new Response("OK (no repoId)", { status: 200 });
    }

    if ((eventName === "subscription_created" || eventName === "subscription_updated") && payload.data?.attributes?.status === "active") {
      const subscriptionId = payload.data?.id;
      if (subscriptionId) {
        await persistSubscriptionId(repoId, subscriptionId, supabase);
      }

      console.log(`[lemonsqueezy-webhook] Upgrading repo ${repoId} to pro`);
      const { error } = await supabase
        .from("repos")
        .update({ plan: "pro" })
        .eq("id", repoId);
      if (error) {
        console.error(`[lemonsqueezy-webhook] Upgrade failed: ${error.message}`);
        return new Response("Database error", { status: 500 });
      }
    } else if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
      console.log(`[lemonsqueezy-webhook] Downgrading repo ${repoId} to free`);
      const { error } = await supabase
        .from("repos")
        .update({ plan: "free", lemonsqueezy_subscription_id: null })
        .eq("id", repoId);
      if (error) {
        console.error(`[lemonsqueezy-webhook] Downgrade failed: ${error.message}`);
        return new Response("Database error", { status: 500 });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("[lemonsqueezy-webhook] Error processing webhook:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
