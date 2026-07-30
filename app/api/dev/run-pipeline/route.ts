/**
 * app/api/dev/run-pipeline/route.ts
 *
 * Piece 8 — a DEV-ONLY manual trigger for the pipeline, so you can run the full
 * scan→patch→PR flow on demand without waiting for the daily cron.
 *
 * Safety:
 *  - Returns 404 in production (NODE_ENV === "production"). This route simply
 *    does not exist in a deployed build.
 *  - Optionally still honours CRON_SECRET if you set it, but it's primarily
 *    meant for `next dev` on localhost.
 *
 * Usage (local):
 *   # Run against the DB high-water mark:
 *   curl -X POST http://localhost:3000/api/dev/run-pipeline
 *
 *   # Force a specific baseline (diff everything newer than this tag):
 *   curl -X POST http://localhost:3000/api/dev/run-pipeline \
 *     -H 'content-type: application/json' \
 *     -d '{"lastSeenEntryId":"v2347"}'
 */

import { runPipeline, runPipelineFromDb } from "@/lib/pipeline/run-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function POST(request: Request): Promise<Response> {
  if (isProd()) {
    return new Response("Not found", { status: 404 });
  }

  let lastSeenEntryId: string | null | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { lastSeenEntryId?: string | null };
      lastSeenEntryId = body.lastSeenEntryId;
    }
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const result =
      lastSeenEntryId === undefined
        ? await runPipelineFromDb()
        : await runPipeline(lastSeenEntryId);

    return Response.json(
      { ok: true, durationMs: Date.now() - startedAt, ...result },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[dev/run-pipeline] failed:", message);
    return Response.json(
      { ok: false, durationMs: Date.now() - startedAt, error: message },
      { status: 500 },
    );
  }
}
