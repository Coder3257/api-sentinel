/**
 * app/api/webhooks/github/route.ts
 *
 * Receives GitHub App webhook events and keeps the `repos` table in sync.
 *
 * Events handled:
 *   installation              created  → upsert repos
 *   installation              deleted  → delete all repos for installation
 *   installation_repositories added    → upsert repos_added
 *   installation_repositories removed  → delete repos_removed
 *   push                               → logged only (pipeline wired in Piece 8)
 *
 * Security:
 *   Every request is verified with HMAC-SHA256 using GITHUB_WEBHOOK_SECRET
 *   before any payload is processed. Uses timingSafeEqual to prevent
 *   timing-oracle attacks.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseClient } from "@/lib/supabase/client";

// Always dynamic — webhook endpoint must never be cached.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  // Lengths must match before timingSafeEqual (it throws on length mismatch).
  if (signatureHeader.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Payload types (minimal — only the fields we actually use)
// ---------------------------------------------------------------------------

interface GHRepo {
  id: number;
  name: string;
  full_name: string;  // "owner/name"
}

interface InstallationPayload {
  action: string;
  installation: { id: number; app_id: number };
  repositories?: GHRepo[];          // present on installation.created (selected repos)
  repositories_added?: GHRepo[];    // installation_repositories.added
  repositories_removed?: GHRepo[];  // installation_repositories.removed
  repository?: GHRepo;              // present on push
  ref?: string;                     // push: "refs/heads/main"
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function upsertRepos(
  repos: GHRepo[],
  installationId: number,
): Promise<void> {
  if (repos.length === 0) return;

  const supabase = getSupabaseClient();

  const rows = repos.map((r) => {
    const [owner, name] = r.full_name.split("/");
    return {
      github_repo_id: r.id,
      owner,
      name,
      installation_id: installationId,
      default_branch: "main", // scanner will correct this when it runs
    };
  });

  const { error } = await supabase
    .from("repos")
    .upsert(rows, { onConflict: "github_repo_id" });

  if (error) {
    throw new Error(`Failed to upsert repos: ${error.message}`);
  }

  console.log(
    `[webhook] Upserted ${rows.length} repo(s) for installation ${installationId}:`,
    rows.map((r) => `${r.owner}/${r.name}`).join(", "),
  );
}

async function deleteReposByInstallation(installationId: number): Promise<void> {
  const supabase = getSupabaseClient();

  const { error, count } = await supabase
    .from("repos")
    .delete({ count: "exact" })
    .eq("installation_id", installationId);

  if (error) {
    throw new Error(`Failed to delete repos: ${error.message}`);
  }

  console.log(
    `[webhook] Deleted ${count ?? "?"} repo(s) for uninstalled installation ${installationId}`,
  );
}

async function deleteReposByGithubId(repoIds: number[]): Promise<void> {
  if (repoIds.length === 0) return;

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("repos")
    .delete()
    .in("github_repo_id", repoIds);

  if (error) {
    throw new Error(`Failed to delete repos by ID: ${error.message}`);
  }

  console.log(`[webhook] Removed ${repoIds.length} repo(s):`, repoIds);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Read raw body — MUST happen before any json() call for HMAC to work.
  const rawBody = await request.text();

  // 2. Verify signature.
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] GITHUB_WEBHOOK_SECRET is not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    console.warn("[webhook] Signature verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Parse payload.
  let payload: InstallationPayload;
  try {
    payload = JSON.parse(rawBody) as InstallationPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = request.headers.get("x-github-event") ?? "unknown";
  const installationId = payload.installation?.id;

  console.log(`[webhook] Received event="${event}" action="${payload.action}" installation=${installationId}`);

  // 4. Dispatch.
  try {
    if (event === "installation") {
      if (payload.action === "created") {
        // GitHub sends `repositories` only when installing on selected repos.
        // If the App is installed on "All repositories", the list is empty here
        // — the cron job will discover repos via the API when it runs.
        await upsertRepos(payload.repositories ?? [], installationId);

      } else if (payload.action === "deleted") {
        await deleteReposByInstallation(installationId);
      }

    } else if (event === "installation_repositories") {
      if (payload.action === "added") {
        await upsertRepos(payload.repositories_added ?? [], installationId);
      }
      if (payload.action === "removed") {
        const ids = (payload.repositories_removed ?? []).map((r) => r.id);
        await deleteReposByGithubId(ids);
      }

    } else if (event === "push") {
      // Piece 8 will wire push → re-scan. Logged only for now.
      const branch = payload.ref?.replace("refs/heads/", "") ?? "unknown";
      const repoName = payload.repository?.full_name ?? "unknown";
      console.log(`[webhook] Push to ${repoName} on branch "${branch}" — scan not yet wired`);

    } else {
      // Unknown event — acknowledge silently.
      console.log(`[webhook] Ignored event: ${event}`);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] Handler error:`, message);
    // Return 500 so GitHub retries (it retries 3 times with backoff).
    return new Response(`Handler error: ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
