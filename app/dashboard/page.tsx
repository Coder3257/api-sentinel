import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

// Opt out of static caching so dashboard displays live database data.
export const revalidate = 0;

interface Repo {
  owner: string;
  name: string;
}

interface PullRequest {
  pr_url: string;
  status: string;
}

interface ScanRow {
  id: string;
  status: string;
  created_at: string;
  repos: Repo | Repo[] | null;
  pull_requests: PullRequest[] | null;
}

export default async function DashboardPage() {
  const supabase = getSupabaseClient();

  // Fetch counts in parallel
  const [reposRes, scansRes, prsRes, scansListRes] = await Promise.all([
    supabase.from("repos").select("id", { count: "exact", head: true }),
    supabase.from("scans").select("id", { count: "exact", head: true }),
    supabase.from("pull_requests").select("id", { count: "exact", head: true }),
    supabase
      .from("scans")
      .select(`
        id,
        status,
        created_at,
        repos (
          owner,
          name
        ),
        pull_requests (
          pr_url,
          status
        )
      `)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const totalRepos = reposRes.count || 0;
  const totalScans = scansRes.count || 0;
  const totalPRs = prsRes.count || 0;
  const scans = (scansListRes.data as unknown as ScanRow[]) || [];

  return (
    <div style={{ background: "#060913", color: "#f3f4f6", minHeight: "100vh", fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif", padding: "40px 24px", position: "relative", overflowX: "hidden" }}>
      {/* Background Glowing Gradient Orb Accents */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "70vw",
          height: "70vw",
          maxWidth: "800px",
          maxHeight: "800px",
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, rgba(16, 185, 129, 0.03) 50%, rgba(0,0,0,0) 100%)",
          borderRadius: "50%",
          pointerEvents: "none",
          filter: "blur(80px)",
          zIndex: 0,
        }}
      />

      <div style={{ maxWidth: "1120px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Navigation & Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ width: "16px", height: "16px", borderRadius: "5px", background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)", boxShadow: "0 0 10px rgba(6, 182, 212, 0.5)" }} />
              <Link href="/" style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af", textDecoration: "none" }}>API Sentinel</Link>
            </div>
            <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.03em", color: "#ffffff", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
              Live Activity Feed
              <span style={{ display: "inline-flex", position: "relative", width: "10px", height: "10px" }}>
                <span className="live-pulse" style={{ position: "absolute", inlineSize: "100%", blockSize: "100%", borderRadius: "50%", background: "#10b981", opacity: 0.75 }}></span>
                <span style={{ position: "relative", display: "inline-flex", borderRadius: "50%", width: "10px", height: "10px", background: "#10b981" }}></span>
              </span>
            </h1>
            <p style={{ color: "#6b7280", fontSize: "14px", margin: "4px 0 0" }}>
              Real-time compatibility scanning and patching status
            </p>
          </div>
          <Link
            href="/"
            style={{
              padding: "8px 16px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "13px",
              color: "#f3f4f6",
              textDecoration: "none",
            }}
          >
            Back to Home
          </Link>
        </header>

        {/* Stats Grid */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "48px" }}>
          {[
            { value: totalRepos, label: "Repos Monitored", subtext: "in active beta" },
            { value: totalScans, label: "Scans Run", subtext: "continuous verification" },
            { value: totalPRs, label: "Pull Requests Opened", subtext: "automated compatibility fixes" },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: "#0a0d16",
                border: "1px solid rgba(6, 182, 212, 0.15)",
                borderRadius: "16px",
                padding: "32px",
                textAlign: "center",
                boxShadow: "0 8px 30px rgba(6, 182, 212, 0.03), inset 0 0 16px rgba(6, 182, 212, 0.02)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "16px",
                  padding: "1px",
                  background: "linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(16, 185, 129, 0) 100%)",
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  fontSize: "44px",
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  marginBottom: "6px",
                  letterSpacing: "-0.03em",
                }}
              >
                {stat.value}
              </div>
              <div style={{ color: "#6b7280", fontSize: "14px", fontWeight: 550, letterSpacing: "0.01em" }}>{stat.label}</div>
              <div style={{ color: "#4b5563", fontSize: "11px", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{stat.subtext}</div>
            </div>
          ))}
        </section>


        {/* Activity Feed Section */}
        <section>
          <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "#ffffff", marginBottom: "24px" }}>
            Recent Activity
          </h2>

          {scans.length === 0 ? (
            <div
              style={{
                background: "#0a0d16",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "16px",
                padding: "48px 24px",
                textAlign: "center",
                color: "#6b7280",
                fontSize: "15px",
              }}
            >
              No scans yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {scans.map((scan) => {
                const repo = Array.isArray(scan.repos) ? scan.repos[0] : scan.repos;
                const pr = scan.pull_requests && scan.pull_requests.length > 0 ? scan.pull_requests[0] : null;

                // Color mappings for different statuses
                let statusColor = "#6b7280";
                let statusBg = "rgba(107, 114, 128, 0.1)";
                let statusBorder = "rgba(107, 114, 128, 0.2)";

                switch (scan.status) {
                  case "done":
                    statusColor = "#10b981";
                    statusBg = "rgba(16, 185, 129, 0.1)";
                    statusBorder = "rgba(16, 185, 129, 0.2)";
                    break;
                  case "failed":
                    statusColor = "#ef4444";
                    statusBg = "rgba(239, 68, 68, 0.1)";
                    statusBorder = "rgba(239, 68, 68, 0.2)";
                    break;
                  case "scanning":
                  case "patching":
                    statusColor = "#06b6d4";
                    statusBg = "rgba(6, 182, 212, 0.1)";
                    statusBorder = "rgba(6, 182, 212, 0.2)";
                    break;
                  case "pending":
                    statusColor = "#f59e0b";
                    statusBg = "rgba(245, 158, 11, 0.1)";
                    statusBorder = "rgba(245, 158, 11, 0.2)";
                    break;
                  case "skipped":
                    statusColor = "#9ca3af";
                    statusBg = "rgba(156, 163, 175, 0.1)";
                    statusBorder = "rgba(156, 163, 175, 0.2)";
                    break;
                }

                return (
                  <div
                    key={scan.id}
                    style={{
                      background: "#0a0d16",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "16px",
                      padding: "24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#ffffff", margin: 0 }}>
                          {repo ? `${repo.owner}/${repo.name}` : "Unknown Repository"}
                        </h3>
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>
                          Scan ID: {scan.id}
                        </span>
                      </div>
                      <span style={{ fontSize: "13px", color: "#9ca3af" }}>
                        {new Date(scan.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          color: statusColor,
                          background: statusBg,
                          border: `1px solid ${statusBorder}`,
                        }}
                      >
                        {scan.status}
                      </span>

                      {pr && (
                        <a
                          href={pr.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "13px",
                            color: "#06b6d4",
                            fontWeight: 600,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          View Pull Request ({pr.status})
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
