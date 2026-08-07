import { timingSafeEqual } from "crypto";
import { runDependencyScanPipeline } from "@/lib/pipeline/run-dependency-scan-pipeline";

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
    const result = await runDependencyScanPipeline();
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
    console.error("[cron] Dependency scan pipeline failed:", message);
    console.error(`[ALERT] Cron execution failed: endpoint="/api/cron/dependency-patch" error="${message}"`);
    return Response.json(
      { ok: false, durationMs: Date.now() - startedAt, error: message },
      { status: 500 },
    );
  }
}
