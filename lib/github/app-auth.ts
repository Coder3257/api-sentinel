import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Helpers — validate + normalise env vars at call time, not module load time,
// so test scripts can set env vars before importing this module.
// ---------------------------------------------------------------------------

function getPrivateKey(): string {
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!key) throw new Error("GITHUB_APP_PRIVATE_KEY is not set");
  // Env vars stored with literal \n (e.g. in Vercel dashboard) — restore newlines.
  return key.replace(/\\n/g, "\n");
}

function getAppId(): number {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new Error("GITHUB_APP_ID is not set");
  const parsed = Number(id);
  if (isNaN(parsed)) throw new Error(`GITHUB_APP_ID must be a number, got: "${id}"`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Auth factory cache
//
// @octokit/auth-app already caches tokens internally per factory instance and
// refreshes them before expiry (tokens last 1 hour). We cache the factory
// itself so warm serverless invocations that hit the same installation reuse
// the cached token without an extra API round-trip.
// ---------------------------------------------------------------------------

const authFactoryCache = new Map<number, ReturnType<typeof createAppAuth>>();

function getAuthFactory(installationId: number): ReturnType<typeof createAppAuth> {
  if (!authFactoryCache.has(installationId)) {
    authFactoryCache.set(
      installationId,
      createAppAuth({
        appId: getAppId(),
        privateKey: getPrivateKey(),
        installationId,
      }),
    );
  }
  return authFactoryCache.get(installationId)!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a short-lived installation access token for the given GitHub App
 * installation. Tokens are valid for 1 hour; @octokit/auth-app handles
 * caching and refresh transparently.
 *
 * Use the raw token when you need it for non-Octokit calls (e.g. the GitHub
 * Contents API via fetch in pr-opener.ts).
 */
export async function getInstallationToken(installationId: number): Promise<string> {
  const auth = getAuthFactory(installationId);
  const result = await auth({ type: "installation" });
  return result.token;
}

/**
 * Returns a fully authenticated Octokit instance for the given GitHub App
 * installation. Use this for all typed GitHub REST API calls.
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}
