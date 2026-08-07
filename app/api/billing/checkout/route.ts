import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createCheckout, lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repoId } = await req.json();
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

    // Initialize Lemon Squeezy SDK
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    const variantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;

    if (!apiKey || !storeId || !variantId) {
      return NextResponse.json({ error: "Lemon Squeezy configuration is missing" }, { status: 500 });
    }

    lemonSqueezySetup({ apiKey });

    const redirectUrl = `${process.env.NEXTAUTH_URL || "https://api-sentinel-zeta.vercel.app"}/dashboard`;

    const { data, error } = await createCheckout(
      storeId,
      variantId,
      {
        checkoutData: {
          custom: {
            repo_id: repoId,
          },
        },
        productOptions: {
          redirectUrl,
        },
      }
    );

    if (error || !data) {
      console.error("Lemon Squeezy checkout creation failed:", error);
      return NextResponse.json({ error: error?.message || "Failed to create checkout session" }, { status: 500 });
    }

    const checkoutUrl = data.data?.attributes?.url;
    if (!checkoutUrl) {
      return NextResponse.json({ error: "Checkout URL not found in response" }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
