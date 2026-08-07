"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import ThemeToggle from "@/app/components/ThemeToggle";

interface Repo {
  id: string;
  owner: string;
  name: string;
  plan: string;
}

export default function PricingPage() {
  const { data: session, status } = useSession();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [showSelector, setShowSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/repos")
        .then((res) => res.json())
        .then((data) => {
          if (data.repos) {
            setRepos(data.repos);
            // Default to first repo that is not already pro
            const firstFree = data.repos.find((r: Repo) => r.plan !== "pro");
            if (firstFree) {
              setSelectedRepoId(firstFree.id);
            } else if (data.repos.length > 0) {
              setSelectedRepoId(data.repos[0].id);
            }
          }
        })
        .catch((err) => console.error("Failed to load repositories:", err));
    }
  }, [status]);

  const handleProClick = async () => {
    if (status !== "authenticated") {
      signIn("github", { callbackUrl: "/pricing" });
      return;
    }

    if (!showSelector) {
      setShowSelector(true);
      return;
    }

    if (!selectedRepoId) {
      setErrorMsg("Please select a repository to upgrade.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: selectedRepoId }),
      });

      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setErrorMsg(data.error || "Failed to create checkout session.");
        setLoading(false);
      }
    } catch (err) {
      setErrorMsg("Connection error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", fontFamily: "var(--font-sans)", padding: "40px 24px", position: "relative", overflowX: "hidden" }}>
      
      {/* Background Glowing Gradient Orb Accents */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: 0,
          right: 0,
          margin: "0 auto",
          width: "100%",
          maxWidth: "800px",
          height: "70vw",
          maxHeight: "800px",
          background: "var(--gradient-hero)",
          borderRadius: "50%",
          pointerEvents: "none",
          filter: "blur(80px)",
          zIndex: 0,
          opacity: 0.8,
        }}
      />

      <div style={{ maxWidth: "1120px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Navigation & Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "80px", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "16px", height: "16px", borderRadius: "5px", background: "var(--gradient-brand)", boxShadow: "0 0 10px var(--accent-glow)" }} />
            <Link href="/" style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", textDecoration: "none", letterSpacing: "-0.02em" }}>
              API Sentinel
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ThemeToggle />
            <Link
              href={status === "authenticated" ? "/dashboard" : "/"}
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
              {status === "authenticated" ? "Dashboard" : "Back to Home"}
            </Link>
          </div>
        </header>

        {/* Pricing Content */}
        <main style={{ textAlign: "center", maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ marginBottom: "56px" }}>
            <h1 style={{ fontSize: "48px", fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 16px" }}>
              Simple, transparent <span style={{ background: "var(--gradient-brand)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>pricing.</span>
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "18px", maxWidth: "600px", margin: "0 auto", lineHeight: 1.6 }}>
              Protect your repositories from breaking API upgrades. Choose the plan that fits your pipeline.
            </p>
          </div>

          {/* Pricing Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "32px", margin: "0 auto 80px", maxWidth: "800px", textAlign: "left" }}>
            
            {/* Free Tier Card */}
            <div
              className="hover-card"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                padding: "40px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-panel)",
              }}
            >
              <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>Free</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 24px", minHeight: "40px" }}>
                Essential protection for open-source and individual integrations.
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "32px" }}>
                <span style={{ fontSize: "36px", fontWeight: 800, color: "var(--text)" }}>$0</span>
                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>/ forever</span>
              </div>

              <div style={{ flexGrow: 1, marginBottom: "40px" }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
                  {[
                    "Unlimited repositories",
                    "Stripe SDK breaking-change detection & AI patching",
                    "Draft PRs for review",
                    "Email notifications",
                  ].map((feat, idx) => (
                    <li key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={status === "authenticated" ? "/dashboard" : "/api/auth/signin"}
                onClick={(e) => {
                  if (status !== "authenticated") {
                    e.preventDefault();
                    signIn("github", { callbackUrl: "/dashboard" });
                  }
                }}
                className="btn-hover"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px 24px",
                  background: "var(--bg)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "8px",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: "14px",
                  textDecoration: "none",
                  transition: "all 0.2s",
                }}
              >
                {status === "authenticated" ? "Go to Dashboard" : "Get Started"}
              </Link>
            </div>

            {/* Pro Tier Card */}
            <div
              className="hover-card"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--accent)",
                borderRadius: "16px",
                padding: "40px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: "0 0 30px rgba(124, 58, 237, 0.15)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "-12px",
                  right: "24px",
                  background: "var(--gradient-brand)",
                  color: "var(--accent-contrast)",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  boxShadow: "0 2px 10px var(--accent-glow)",
                }}
              >
                Popular
              </div>

              <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>Pro</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 24px", minHeight: "40px" }}>
                Complete coverage for professional applications and monorepos.
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "32px" }}>
                <span style={{ fontSize: "36px", fontWeight: 800, color: "var(--text)" }}>$24</span>
                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>/ mo per repo</span>
              </div>

              <div style={{ flexGrow: 1, marginBottom: "40px" }}>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
                  {[
                    "Everything in Free",
                    "AI patching for ANY dependency upgrade (eslint, typescript, any npm package)",
                    "Priority scanning & instant runs",
                    "Slack & Discord webhook integrations",
                  ].map((feat, idx) => (
                    <li key={idx} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "14px", color: "var(--text-secondary)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Repo Selector & Actions */}
              {showSelector && (
                <div style={{ marginBottom: "20px" }}>
                  {repos.length === 0 ? (
                    <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
                      No connected repositories. <Link href="/connect" style={{ color: "var(--accent)" }}>Connect a repo</Link> first.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>Select Repository:</label>
                      <select
                        value={selectedRepoId}
                        onChange={(e) => setSelectedRepoId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--text)",
                          fontSize: "14px",
                        }}
                      >
                        {repos.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.owner}/{r.name} {r.plan === "pro" ? "(Already Pro)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div style={{ color: "var(--breaking)", fontSize: "13px", marginBottom: "16px" }}>
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleProClick}
                disabled={loading || (showSelector && repos.length === 0)}
                className="btn-hover"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  padding: "12px 24px",
                  background: loading ? "rgba(124, 58, 237, 0.4)" : "var(--gradient-brand)",
                  border: "none",
                  borderRadius: "8px",
                  color: "var(--accent-contrast)",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: loading || (showSelector && repos.length === 0) ? "not-allowed" : "pointer",
                  boxShadow: loading ? "none" : "0 4px 12px var(--accent-glow)",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "Redirecting..." : showSelector ? "Upgrade Now" : "Upgrade to Pro"}
              </button>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
