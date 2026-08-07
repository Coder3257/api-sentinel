/**
 * lib/dashboard/queries.ts
 *
 * Server-only read queries. Consumed by app/api/assistant/chat/route.ts to
 * build the AI assistant's context. All use the service-role Supabase client,
 * which bypasses RLS, so this file must never be imported from a client
 * component and every query MUST filter by userId.
 *
 * userId is a required parameter on purpose. It was optional, and every
 * `if (userId)` guard meant a caller that forgot to pass it would silently
 * receive every user's rows. Making it required moves that from a runtime
 * data leak to a compile error.
 *
 * Each query is defensive: on error it logs and returns an empty result rather
 * than throwing, so one broken query never blanks the whole response.
 */

import { getSupabaseClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types (shaped for the UI, not 1:1 with DB rows)
// ---------------------------------------------------------------------------

export interface DashboardRepo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  installationId: number;
  createdAt: string;
}

export interface DashboardScan {
  id: string;
  repo: string; // "owner/name"
  /** What caused this scan to run. */
  trigger: "stripe" | "upgrade" | "unknown";
  /** Human-readable subject: a changelog title, or "eslint 9.0.0 → 10.8.0". */
  subject: string;
  /** Stripe changelog entry id, or "—" for upgrade scans. */
  changelogEntryId: string;
  severity: string;
  /** Set only on upgrade scans. */
  packageName: string | null;
  fromVersion: string | null;
  toVersion: string | null;
  status: string;
  affectedFileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  repos: DashboardRepo[];
  scans: DashboardScan[];
}

// ---------------------------------------------------------------------------
// Individual queries
// ---------------------------------------------------------------------------

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const [repos, scans] = await Promise.all([
    getRepos(userId),
    getRecentScans(25, userId)
  ]);

  return {
    repos,
    scans,
  };
}

async function getRepos(userId: string): Promise<DashboardRepo[]> {
  const supabase = getSupabaseClient();
  const query = supabase
    .from("repos")
    .select("id, owner, name, default_branch, installation_id, created_at")
    .eq("user_id", userId);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[dashboard] getRepos failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    owner: r.owner as string,
    name: r.name as string,
    defaultBranch: r.default_branch as string,
    installationId: r.installation_id as number,
    createdAt: r.created_at as string,
  }));
}

interface ScanJoinRow {
  id: string;
  status: string;
  affected_files: unknown;
  created_at: string;
  updated_at: string;
  repos: { owner: string; name: string } | null;
  stripe_changelogs: {
    title: string;
    entry_id: string;
    severity: string;
  } | null;
  upgrade_candidates: {
    from_version: string;
    to_version: string;
    breaking_confirmed: boolean;
    repo_dependencies: { package_name: string; ecosystem: string } | null;
  } | null;
}

/**
 * Recent scans across both trigger types.
 *
 * A scan row carries two nullable FKs and a CHECK guaranteeing exactly one is
 * set: changelog_id (Stripe pipeline) or upgrade_candidate_id (dependency
 * pipeline). Joining only stripe_changelogs made every upgrade scan surface as
 * `title: "—", severity: "unknown"`, which the AI assistant then repeated back
 * to the user as fact. Both are joined here and `trigger` says which is real.
 */
async function getRecentScans(limit = 25, userId: string): Promise<DashboardScan[]> {
  const supabase = getSupabaseClient();
  const query = supabase
    .from("scans")
    .select(
      `id, status, affected_files, created_at, updated_at,
       repos!inner ( owner, name, user_id ),
       stripe_changelogs ( title, entry_id, severity ),
       upgrade_candidates (
         from_version,
         to_version,
         breaking_confirmed,
         repo_dependencies ( package_name, ecosystem )
       )`,
    )
    .eq("repos.user_id", userId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[dashboard] getRecentScans failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as ScanJoinRow[];
  return rows.map((s) => {
    const affected = Array.isArray(s.affected_files) ? s.affected_files : [];
    const upgrade = s.upgrade_candidates;
    const changelog = s.stripe_changelogs;

    const base = {
      id: s.id,
      repo: s.repos ? `${s.repos.owner}/${s.repos.name}` : "unknown",
      status: s.status,
      affectedFileCount: affected.length,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    };

    if (upgrade) {
      const pkg = upgrade.repo_dependencies?.package_name ?? "unknown package";
      return {
        ...base,
        trigger: "upgrade" as const,
        subject: `${pkg} ${upgrade.from_version} → ${upgrade.to_version}`,
        changelogEntryId: "—",
        // A major-version bump is a breaking change by semver definition.
        // breaking_confirmed means the AI verified it against release notes,
        // which is a stronger claim and only set once a patch run has happened.
        severity: upgrade.breaking_confirmed ? "breaking" : "major",
        packageName: pkg,
        fromVersion: upgrade.from_version,
        toVersion: upgrade.to_version,
      };
    }

    if (changelog) {
      return {
        ...base,
        trigger: "stripe" as const,
        subject: changelog.title,
        changelogEntryId: changelog.entry_id,
        severity: changelog.severity,
        packageName: "stripe",
        fromVersion: null,
        toVersion: null,
      };
    }

    // The CHECK constraint makes this unreachable, but a join that silently
    // returns null (RLS, deleted parent row) must not masquerade as a real scan.
    return {
      ...base,
      trigger: "unknown" as const,
      subject: "—",
      changelogEntryId: "—",
      severity: "unknown",
      packageName: null,
      fromVersion: null,
      toVersion: null,
    };
  });
}
