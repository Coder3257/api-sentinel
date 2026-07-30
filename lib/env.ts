/**
 * lib/env.ts
 *
 * Centralised environment access + validation.
 *
 * Two concerns:
 *  1. Server secrets (GitHub App, Supabase service role, Gemini, cron secret).
 *     Read lazily so a missing var throws where it's used, not at import time.
 *  2. Public config (GitHub App slug) safe to expose to the browser via
 *     NEXT_PUBLIC_* — used to build the "Install on GitHub" URL.
 *
 * The `checkEnv()` helper powers /api/status: it reports which required vars
 * are present WITHOUT ever returning their values.
 */

/** Server-only required vars — the pipeline cannot run without these. */
const REQUIRED_SERVER_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_AI_API_KEY",
  "CRON_SECRET",
] as const;

/** Optional vars — have sane defaults or are only needed for onboarding UX. */
const OPTIONAL_VARS = [
  "NEXT_PUBLIC_GITHUB_APP_SLUG",
  "GOOGLE_AI_MODEL",
  "STRIPE_OPENAPI_REPO_OWNER",
  "STRIPE_OPENAPI_REPO_NAME",
  "STRIPE_OPENAPI_SPEC_PATH",
] as const;

export interface EnvReport {
  ok: boolean;
  missing: string[];
  present: string[];
  optionalPresent: string[];
}

/**
 * Reports presence (never values) of required + optional env vars.
 * Safe to expose in a status endpoint.
 */
export function checkEnv(): EnvReport {
  const missing: string[] = [];
  const present: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    if (process.env[key] && process.env[key]!.trim() !== "") present.push(key);
    else missing.push(key);
  }

  const optionalPresent = OPTIONAL_VARS.filter(
    (key) => process.env[key] && process.env[key]!.trim() !== "",
  );

  return { ok: missing.length === 0, missing, present, optionalPresent };
}

/**
 * The public URL a new user visits to install the GitHub App.
 * Uses NEXT_PUBLIC_GITHUB_APP_SLUG when set; otherwise null so the UI can fall
 * back to a generic "create a GitHub App" message.
 */
export function githubAppInstallUrl(): string | null {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  if (!slug) return null;
  return `https://github.com/apps/${slug}/installations/new`;
}
