/**
 * app/api/status/route.ts
 *
 * Readiness probe. Reports whether the app is correctly configured and can
 * reach its dependencies, WITHOUT leaking any secret values.
 *
 * Checks:
 *  - required env vars are present (names only, never values)
 *  - Supabase is reachable (a trivial count query against `repos`)
 *
 * Returns 200 when ready, 503 when a dependency is missing/unreachable, so it
 * can be used as a deploy gate or monitor. Never cached.
 */

import { checkEnv } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkSupabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("repos")
      .select("id", { count: "exact", head: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(): Promise<Response> {
  const env = checkEnv();

  // Only try Supabase if its env vars exist — otherwise the check is moot.
  const supabaseConfigured =
    !env.missing.includes("NEXT_PUBLIC_SUPABASE_URL") &&
    !env.missing.includes("SUPABASE_SERVICE_ROLE_KEY");

  const db = supabaseConfigured
    ? await checkSupabase()
    : { ok: false, error: "Supabase env vars missing" };

  const ready = env.ok && db.ok;

  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      time: new Date().toISOString(),
      checks: {
        env: {
          ok: env.ok,
          missingRequired: env.missing,
          optionalPresent: env.optionalPresent,
        },
        database: db,
      },
    },
    { status: ready ? 200 : 503 },
  );
}
