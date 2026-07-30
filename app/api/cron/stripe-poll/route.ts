/**
 * app/api/cron/stripe-poll/route.ts
 *
 * Piece 8 — the daily cron entry point wired in vercel.json:
 *   { "path": "/api/cron/stripe-poll", "schedule": "0 0 * * *" }
 *
 * Vercel Cron invokes this endpoint with a GET request. We protect it two ways:
 *
 *  1. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when
 *     CRON_SECRET is set as an env var. We verify it with a timing-safe compare.
 *  2. If CRON_SECRET is unset we refuse to run (fail closed) rather than expose
 *     an unauthenticated pipeline trigger.
 *
 * The handler itself is thin: it delegates all real work to runPipelineFromDb()
 * and returns a JSON summary. Errors return 500 (Vercel logs + alerts on this).
 */

import { timingSafeEqual } from "crypto";
import { runPipelineFromDb } from "@/lib/pipeline/run-pipeline";

// Never cache a cron endpoint, and force Node.js runtime (crypto + octokit).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Give the pipeline room — scanning + sequential Gemini calls can take a while.
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

/** Fail-closed auth check for the cron secret. */
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
    const result = await runPipelineFromDb();
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
    console.error("[cron] Pipeline run failed:", message);
    return Response.json(
      { ok: false, durationMs: Date.now() - startedAt, error: message },
      { status: 500 },
    );
  }
}
