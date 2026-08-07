import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const userId = (session.user as any).id;

    // Fetch user's repos
    const { data: repos, error: reposErr } = await supabase
      .from("repos")
      .select("id, owner, name")
      .eq("user_id", userId);

    if (reposErr || !repos) {
      return NextResponse.json({ error: reposErr?.message || "Failed to fetch repositories" }, { status: 500 });
    }

    if (repos.length === 0) {
      return NextResponse.json([]);
    }

    const repoIds = repos.map((r) => r.id);

    // Fetch all repo_dependencies to check scanning status and Stripe versions
    const { data: allDeps, error: depsErr } = await supabase
      .from("repo_dependencies")
      .select("repo_id, package_name, declared_range, detected_at")
      .in("repo_id", repoIds);

    if (depsErr || !allDeps) {
      return NextResponse.json({ error: depsErr?.message || "Failed to fetch dependencies" }, { status: 500 });
    }

    // Fetch all stripe_changelogs to calculate version dates
    const { data: changelogs, error: changelogsErr } = await supabase
      .from("stripe_changelogs")
      .select("entry_id, published_at")
      .order("published_at", { ascending: false });

    if (changelogsErr || !changelogs) {
      return NextResponse.json({ error: changelogsErr?.message || "Failed to fetch stripe changelogs" }, { status: 500 });
    }

    const latestChangelog = changelogs[0];
    const latestChangelogDate = latestChangelog ? new Date(latestChangelog.published_at) : null;

    const changelogMap = new Map<string, Date>(
      changelogs.map((c) => [c.entry_id.toLowerCase().trim(), new Date(c.published_at)])
    );

    // Compute health score for each repository
    const results = repos.map((repo) => {
      const repoDeps = allDeps.filter((d) => d.repo_id === repo.id);

      if (repoDeps.length === 0) {
        // No dependency data yet
        return {
          repoId: repo.id,
          repoName: `${repo.owner}/${repo.name}`,
          score: null,
          lagWeeks: null,
          lastScanAt: null,
        };
      }

      // Check for Stripe package dependency
      const stripeDep = repoDeps.find((d) => d.package_name === "stripe");
      // Find the most recent detected_at date as the last scan time
      const lastScanAt = repoDeps.reduce((max, d) => {
        return !max || new Date(d.detected_at) > new Date(max) ? d.detected_at : max;
      }, repoDeps[0]?.detected_at || null);

      if (!stripeDep) {
        // Has dependency data, but no Stripe usage
        return {
          repoId: repo.id,
          repoName: `${repo.owner}/${repo.name}`,
          score: 100,
          lagWeeks: 0,
          lastScanAt,
        };
      }

      // Parse current declared version to clean string
      const cleanVersion = stripeDep.declared_range
        ? stripeDep.declared_range.replace(/^[~^v\s]+/, "").toLowerCase().trim()
        : "";

      let versionDate: Date | null = null;
      const possibleKeys = [cleanVersion, `v${cleanVersion}`, cleanVersion.replace(/^v/, "")];
      for (const key of possibleKeys) {
        if (key && changelogMap.has(key)) {
          versionDate = changelogMap.get(key)!;
          break;
        }
      }

      let lagWeeks = 0;
      if (latestChangelogDate) {
        if (versionDate) {
          const diffMs = latestChangelogDate.getTime() - versionDate.getTime();
          lagWeeks = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 7));
        } else {
          // Fallback lag calculation: using latest changelog vs scan date, capped at a default or computed
          const diffMs = latestChangelogDate.getTime() - new Date(stripeDep.detected_at).getTime();
          lagWeeks = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 7));
        }
      }

      // Score formula: 100 - (dependency_lag_weeks * 5), clamped 0-100
      const score = Math.max(0, Math.min(100, Math.round(100 - (lagWeeks * 5))));

      return {
        repoId: repo.id,
        repoName: `${repo.owner}/${repo.name}`,
        score,
        lagWeeks: Math.round(lagWeeks * 10) / 10,
        lastScanAt: stripeDep.detected_at,
      };
    });

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
