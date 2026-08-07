/**
 * app/api/cron/dependency-scan/route.ts
 *
 * Daily cron that scans all connected repos for dependency upgrades.
 * Parallel to stripe-poll — both write to the scans table via different
 * trigger columns (changelog_id vs upgrade_candidate_id).
 *
 * Vercel cron config in vercel.json:
 *   { "path": "/api/cron/dependency-scan", "schedule": "0 1 * * *" }
 *
 * Auth: same fail-closed CRON_SECRET check as stripe-poll.
 */

import { timingSafeEqual } from "crypto";
import { runDependencyScan } from "@/lib/pipeline/run-dependency-scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function timingSafeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run.");
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return timingSafeEquals(header, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await runDependencyScan();
    return Response.json(
      {
        ok: true,
        durationMs: Date.now() - startedAt,
        ...result,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] Dependency scan failed:", message);
    console.error(`[ALERT] Cron execution failed: endpoint="/api/cron/dependency-scan" error="${message}"`);
    return Response.json(
      { ok: false, durationMs: Date.now() - startedAt, error: message },
      { status: 500 },
    );
  }
}
