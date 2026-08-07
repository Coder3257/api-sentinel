import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getDashboardData } from "@/lib/dashboard/queries";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message, history } = body as {
      message: string;
      history?: { role: "user" | "assistant"; content: string }[];
    };

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const supabase = getSupabaseClient();

    // 1. Fetch dashboard data (repos & scans)
    const dashboardData = await getDashboardData(userId);
    const repos = dashboardData.repos;
    const scans = dashboardData.scans;

    // 2. Fetch repo health scores
    let healthScores: any[] = [];
    if (repos.length > 0) {
      const repoIds = repos.map((r) => r.id);
      const [depsRes, changelogsRes] = await Promise.all([
        supabase
          .from("repo_dependencies")
          .select("repo_id, package_name, declared_range, detected_at")
          .in("repo_id", repoIds),
        supabase
          .from("stripe_changelogs")
          .select("entry_id, published_at")
          .order("published_at", { ascending: false }),
      ]);

      const allDeps = depsRes.data || [];
      const changelogs = changelogsRes.data || [];
      const latestChangelogDate = changelogs[0] ? new Date(changelogs[0].published_at) : null;
      const changelogMap = new Map(changelogs.map((c) => [c.entry_id.toLowerCase().trim(), new Date(c.published_at)]));

      healthScores = repos.map((repo) => {
        const repoDeps = allDeps.filter((d) => d.repo_id === repo.id);
        if (repoDeps.length === 0) {
          return { name: `${repo.owner}/${repo.name}`, score: "Not scanned yet", lagWeeks: null };
        }

        const stripeDep = repoDeps.find((d) => d.package_name === "stripe");
        if (!stripeDep) {
          return { name: `${repo.owner}/${repo.name}`, score: 100, lagWeeks: 0 };
        }

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
            const diffMs = latestChangelogDate.getTime() - new Date(stripeDep.detected_at).getTime();
            lagWeeks = Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 7));
          }
        }

        const score = Math.max(0, Math.min(100, Math.round(100 - (lagWeeks * 5))));
        return {
          name: `${repo.owner}/${repo.name}`,
          score,
          lagWeeks: Math.round(lagWeeks * 10) / 10,
        };
      });
    }

    // 3. Build context prompt
    const upgradeScans = scans.filter((s) => s.trigger === "upgrade");
    const stripeScans = scans.filter((s) => s.trigger === "stripe");

    const contextPrompt = `
You are the API Sentinel Assistant. API Sentinel watches the user's connected
repositories for two kinds of breaking change: Stripe API changelog entries, and
major-version upgrades of any npm dependency. It opens draft pull requests with
AI-generated fixes.

Here is the real-time context of the user's connected repositories, scans, and health scores:

Connected Repositories:
${repos.map((r) => `- ${r.owner}/${r.name} (default branch: ${r.defaultBranch}, linked on ${new Date(r.createdAt).toLocaleDateString()})`).join("\n") || "No repositories connected yet."}

Repository Health Scores (Stripe version lag only — these do not reflect npm dependency upgrades):
${healthScores.map((h) => `- ${h.name}: Score = ${h.score}${h.lagWeeks !== null ? ` (Lag = ${h.lagWeeks} weeks)` : ""}`).join("\n") || "No health scores computed yet."}

Recent Dependency Upgrade Scans:
${upgradeScans.slice(0, 10).map((s) => `- ${s.repo}: ${s.subject} — status ${s.status}, ${s.affectedFileCount} files affected, run ${new Date(s.createdAt).toLocaleDateString()}`).join("\n") || "No dependency upgrade scans yet."}

Recent Stripe Changelog Scans:
${stripeScans.slice(0, 10).map((s) => `- ${s.repo}: ${s.subject} (${s.severity} severity) — status ${s.status}, ${s.affectedFileCount} files affected, run ${new Date(s.createdAt).toLocaleDateString()}`).join("\n") || "No Stripe changelog scans yet."}

Scan status meanings:
- pending: queued, not started
- scanning: reading the repo for affected files
- patching: AI generating the fix
- done: finished; a draft PR was opened if changes were needed
- skipped: nothing to change in this repo
- no_guidance: the upgrade is real, but no usable release notes or changelog
  were found, so no patch was attempted. This is a known limit, not an error.
- failed: the scan itself errored

Instructions:
1. Answer questions about pipeline status, explain scan results, and advise on upgrade steps.
2. Be brief, helpful, and maintain a professional developer-centric tone.
3. If asked to execute code or do actions you cannot do, politely decline.
4. Maintain context using the provided history.
5. Only state facts present in the context above. If the context does not contain
   the answer, say so plainly rather than guessing at versions, dates, or counts.
`;

    // 4. Initialize Gemini client
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured" }, { status: 500 });
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GOOGLE_AI_MODEL || "gemini-2.5-flash";
    const model = ai.getGenerativeModel({ model: modelName });

    // Format chat turns for Gemini SDK
    const contents: any[] = [{ role: "user", parts: [{ text: contextPrompt }] }];
    
    // Add prior turns (limited to last 10 turns max)
    const priorTurns = history ? history.slice(-10) : [];
    priorTurns.forEach((turn) => {
      contents.push({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      });
    });

    // Add current user prompt
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const response = await model.generateContent({ contents });
    const replyText = response.response.text();

    return NextResponse.json({ reply: replyText });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
