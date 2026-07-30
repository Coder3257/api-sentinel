/**
 * app/api/health/route.ts
 *
 * Liveness probe. Cheap, dependency-free, always 200 if the process is up.
 * Use for uptime monitors / load-balancer health checks.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok", service: "api-sentinel", time: new Date().toISOString() });
}
