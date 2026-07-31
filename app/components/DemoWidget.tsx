"use client";

import { useState, useEffect } from "react";

type Stage = "idle" | "detecting" | "patching" | "shipped";

export default function DemoWidget() {
  const [stage, setStage] = useState<Stage>("idle");
  const [diffLinesVisible, setDiffLinesVisible] = useState<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (stage === "detecting") {
      timer = setTimeout(() => {
        setStage("patching");
      }, 2000);
    } else if (stage === "patching") {
      // Reveal lines one by one
      const lineTimer = setInterval(() => {
        setDiffLinesVisible((prev) => {
          if (prev >= 5) {
            clearInterval(lineTimer);
            // After all lines are revealed, wait a bit and go to shipped
            timer = setTimeout(() => {
              setStage("shipped");
            }, 1500);
            return 5;
          }
          return prev + 1;
        });
      }, 4000 / 5); // reveal each of the 5 lines
      return () => clearInterval(lineTimer);
    }

    return () => clearTimeout(timer);
  }, [stage]);

  const handleStart = () => {
    setDiffLinesVisible(0);
    setStage("detecting");
  };

  const handleReset = () => {
    setDiffLinesVisible(0);
    setStage("idle");
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto 80px", textAlign: "left" }}>
      <div
        className="hover-card"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "var(--shadow-panel)",
          transition: "all 0.3s ease",
          position: "relative",
          minHeight: "330px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Widget Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: stage !== "idle" ? "var(--accent)" : "var(--text-muted)" }} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)" }}>
              {stage === "idle" && "Interactive Demo"}
              {stage === "detecting" && "Stage 1: Detecting..."}
              {stage === "patching" && "Stage 2: AI Patching..."}
              {stage === "shipped" && "Stage 3: Shipped!"}
            </span>
          </div>
          {stage === "shipped" && (
            <button
              onClick={handleReset}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              Reset Replay
            </button>
          )}
        </div>

        {/* Widget Content Box */}
        <div style={{ padding: "24px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {stage === "idle" && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: "20px", fontSize: "15px" }}>
                Simulate how API Sentinel intercepts a breaking Stripe API change and resolves it.
              </p>
              <button
                onClick={handleStart}
                className="btn-hover"
                style={{
                  padding: "12px 24px",
                  background: "var(--gradient-brand)",
                  border: "none",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "14px",
                  boxShadow: "0 4px 12px var(--accent-glow)",
                }}
              >
                Simulate Breaking Change
              </button>
            </div>
          )}

          {stage === "detecting" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 0" }}>
              <div style={{ position: "relative", width: "60px", height: "60px", marginBottom: "20px" }}>
                <span className="live-pulse" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)", opacity: 0.2 }} />
                <div style={{ position: "absolute", inset: "15px", borderRadius: "50%", background: "var(--bg-elevated)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
              </div>
              <p style={{ color: "var(--text)", fontWeight: 600, fontSize: "15px", marginBottom: "6px" }}>
                Scanning stripe/openapi for API changes...
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", maxWidth: "360px" }}>
                Intercepted deprecation: <code>apiVersion</code> string format deprecated in favour of Date object.
              </p>
            </div>
          )}

          {stage === "patching" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", background: "var(--accent-glow)", color: "var(--accent)", padding: "2px 6px", borderRadius: "4px", fontWeight: 650 }}>AI Generation</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>src/lib/stripe-client.ts</span>
              </div>
              <pre style={{ margin: 0, padding: "16px 20px", fontSize: "13px", fontFamily: "var(--font-mono)", lineHeight: "1.7", overflowX: "auto", background: "var(--bg-inset)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <code style={{ display: "block", color: "var(--text-muted)" }}>
                  <span style={{ display: "block", opacity: diffLinesVisible >= 1 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    <span>// stripe-client.ts</span>
                  </span>
                  <span style={{ display: "block", background: "var(--diff-del-bg)", color: "var(--diff-del-text)", margin: "0 -20px", padding: "0 20px", opacity: diffLinesVisible >= 2 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    - const stripe = new Stripe(key, &#123; apiVersion: &apos;2023-10-16&apos; &#125;);
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px", opacity: diffLinesVisible >= 3 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    + const stripe = new Stripe(key, &#123;
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px", opacity: diffLinesVisible >= 4 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    +   apiVersion: &apos;2023-10-16&apos;,
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px", opacity: diffLinesVisible >= 5 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    +   typescript: true
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px", opacity: diffLinesVisible >= 5 ? 1 : 0, transition: "opacity 0.3s ease" }}>
                    + &#125;);
                  </span>
                </code>
              </pre>
            </div>
          )}

          {stage === "shipped" && (
            <div style={{ animation: "fadeIn 0.4s ease-out" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>Pull Request #4 Opened</h4>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Target branch: <code>main</code> &bull; CI Checks passing</span>
                </div>
              </div>

              {/* PR Link Card */}
              <a
                href="https://github.com/Coder3257/ravi-dev/pull/4"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-hover"
                style={{
                  display: "block",
                  padding: "16px",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Coder3257/ravi-dev</span>
                    <h5 style={{ margin: "2px 0 0", fontSize: "14px", color: "var(--text)", fontWeight: 650 }}>stripe-client: fix deprecated apiVersion syntax</h5>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                  </svg>
                </div>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Disclosing Caption */}
      <p style={{ color: "var(--text-muted)", fontSize: "12px", textAlign: "center", marginTop: "12px", fontStyle: "italic" }}>
        * Replaying our actual PR #4 patch, generated live by the agent. This is a guided visual simulation of the live auto-patching flow.
      </p>
    </div>
  );
}
