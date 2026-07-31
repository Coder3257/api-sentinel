"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";

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

interface DashboardClientProps {
  totalRepos: number;
  totalScans: number;
  totalPRs: number;
  scans: ScanRow[];
}

export default function DashboardClient({ totalRepos, totalScans, totalPRs, scans }: DashboardClientProps) {
  const [activeModal, setActiveModal] = useState<{ title: string; content: string } | null>(null);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);

  const getStatusDetails = (status: string) => {
    switch (status.toLowerCase()) {
      case "done":
        return "Verification completed successfully. A patch was applied and a pull request has been opened or code verified.";
      case "skipped":
        return "Scan completed. No Stripe SDK usage was detected, or the Stripe version matches the latest OpenAPI spec baseline.";
      case "scanning":
        return "Dependency parsing in progress. Currently scanning files for Stripe SDK usage.";
      case "patching":
        return "AI patch generation in progress. Generating precise fixes using Gemini models.";
      case "failed":
        return "Scan halted. The scanner encountered an error during parsing, network query, or patch generation.";
      case "pending":
        return "Scan queued. Waiting for system resources to process.";
      default:
        return "No further details available for this scan status.";
    }
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", fontFamily: "var(--font-sans)", padding: "40px 24px", position: "relative", overflowX: "hidden" }}>
      
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
          background: "var(--gradient-hero)",
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
              <span style={{ width: "16px", height: "16px", borderRadius: "5px", background: "var(--gradient-brand)", boxShadow: "0 0 10px var(--accent-glow)" }} />
              <Link href="/" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none" }}>API Sentinel</Link>
            </div>
            <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
              Live Activity Feed
              <span style={{ display: "inline-flex", position: "relative", width: "10px", height: "10px" }}>
                <span className="live-pulse" style={{ position: "absolute", inlineSize: "100%", blockSize: "100%", borderRadius: "50%", background: "#10b981", opacity: 0.75 }}></span>
                <span style={{ position: "relative", display: "inline-flex", borderRadius: "50%", width: "10px", height: "10px", background: "#10b981" }}></span>
              </span>
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "4px 0 0" }}>
              Real-time compatibility scanning and patching status
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ThemeToggle />
            <Link
              href="/"
              className="btn-hover"
              style={{
                padding: "8px 16px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "13px",
                color: "var(--text)",
                textDecoration: "none",
              }}
            >
              Back to Home
            </Link>
          </div>
        </header>

        {/* Stats Grid */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "48px" }}>
          {[
            { value: totalRepos, label: "Repos Monitored", subtext: "in active beta", detail: "Active GitHub repositories registered with the API Sentinel app." },
            { value: totalScans, label: "Scans Run", subtext: "continuous verification", detail: "Total Stripe OpenAPI compatibility scans executed across all monitored repos." },
            { value: totalPRs, label: "Pull Requests Opened", subtext: "automated compatibility fixes", detail: "Pull requests successfully generated by our AI agent and opened on GitHub." },
          ].map((stat, i) => (
            <div
              key={i}
              className="hover-card"
              onClick={() => setActiveModal({ title: stat.label, content: stat.detail })}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                padding: "32px",
                textAlign: "center",
                boxShadow: "var(--shadow-panel)",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: "44px",
                  fontWeight: 800,
                  background: "var(--gradient-brand)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  marginBottom: "6px",
                  letterSpacing: "-0.03em",
                }}
              >
                {stat.value}
              </div>
              <div style={{ color: "var(--text)", fontSize: "14px", fontWeight: 550, letterSpacing: "0.01em" }}>{stat.label}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{stat.subtext}</div>
            </div>
          ))}
        </section>

        {/* Activity Feed Section */}
        <section>
          <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: "24px" }}>
            Recent Activity
          </h2>

          {scans.length === 0 ? (
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                padding: "48px 24px",
                textAlign: "center",
                color: "var(--text-muted)",
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
                let statusColor = "var(--text-muted)";
                let statusBg = "var(--border-faint)";
                let statusBorder = "var(--border)";

                switch (scan.status.toLowerCase()) {
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
                    statusColor = "var(--accent)";
                    statusBg = "var(--accent-glow)";
                    statusBorder = "var(--border-strong)";
                    break;
                  case "pending":
                    statusColor = "#f59e0b";
                    statusBg = "rgba(245, 158, 11, 0.1)";
                    statusBorder = "rgba(245, 158, 11, 0.2)";
                    break;
                  case "skipped":
                    statusColor = "var(--text-secondary)";
                    statusBg = "var(--bg-inset)";
                    statusBorder = "var(--border)";
                    break;
                }

                const isExpanded = expandedScan === scan.id;

                return (
                  <div
                    key={scan.id}
                    className="hover-card"
                    onClick={() => setExpandedScan(isExpanded ? null : scan.id)}
                    style={{
                      background: "var(--bg-elevated)",
                      border: isExpanded ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "16px",
                      padding: "24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      position: "relative",
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
                          {repo ? `${repo.owner}/${repo.name}` : "Unknown Repository"}
                        </h3>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          Scan ID: {scan.id}
                        </span>
                      </div>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
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
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: "13px",
                            color: "var(--accent)",
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

                    {/* Expandable detailed description in-place */}
                    {isExpanded && (
                      <div
                        style={{
                          borderTop: "1px solid var(--border)",
                          paddingTop: "16px",
                          color: "var(--text-secondary)",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          animation: "fadeIn 0.2s ease-out",
                        }}
                      >
                        <strong>Scan Details:</strong>
                        <p style={{ margin: "6px 0 12px" }}>
                          {getStatusDetails(scan.status)}
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "12px", background: "var(--bg-inset)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                          <div><strong>Triggered At:</strong> {new Date(scan.created_at).toUTCString()}</div>
                          <div><strong>Status:</strong> {scan.status.toUpperCase()}</div>
                          <div><strong>Monitored Branch:</strong> main</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Detail Popup Modal (for Stat Cards) */}
      {activeModal && (
        <div
          onClick={() => setActiveModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "480px",
              width: "calc(100% - 32px)",
              position: "relative",
              boxShadow: "var(--shadow-glow)",
              color: "var(--text)",
            }}
          >
            <button
              onClick={() => setActiveModal(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "24px",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              &times;
            </button>
            <h3 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "12px", color: "var(--text)" }}>
              {activeModal.title}
            </h3>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: "15px" }}>
              {activeModal.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
