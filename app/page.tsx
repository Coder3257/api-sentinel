"use client";

import { useState } from "react";
import Link from "next/link";
import WaitlistForm from "@/app/components/WaitlistForm";
import Reveal from "@/app/components/Reveal";
import ThemeToggle from "@/app/components/ThemeToggle";

export default function Home() {
  const [activeModal, setActiveModal] = useState<{ title: string; content: string } | null>(null);

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", fontFamily: "var(--font-sans)", position: "relative", overflow: "hidden" }}>
      
      {/* Floating Ambient Orbs */}
      <div className="float-orb-1" style={{
        position: "absolute",
        top: "15%",
        left: "10%",
        width: "250px",
        height: "250px",
        background: "radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(0,0,0,0) 70%)",
        borderRadius: "50%",
        filter: "blur(60px)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div className="float-orb-2" style={{
        position: "absolute",
        top: "45%",
        right: "15%",
        width: "300px",
        height: "300px",
        background: "radial-gradient(circle, rgba(192, 132, 252, 0.1) 0%, rgba(0,0,0,0) 70%)",
        borderRadius: "50%",
        filter: "blur(80px)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div className="float-orb-1" style={{
        position: "absolute",
        top: "70%",
        left: "25%",
        width: "200px",
        height: "200px",
        background: "radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, rgba(0,0,0,0) 70%)",
        borderRadius: "50%",
        filter: "blur(50px)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Main Glowing Background Accents */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
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

      {/* Navigation */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
          background: "rgba(var(--bg), 0.8)",
          borderBottom: "1px solid var(--border)",
          padding: "16px 24px",
        }}
      >
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "var(--gradient-brand)", boxShadow: "0 0 12px var(--accent-glow)" }} />
            <span>API Sentinel</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="btn-hover"
              style={{
                padding: "10px 20px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "14px",
                color: "var(--text)",
                transition: "all 0.2s",
              }}
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "1120px", margin: "0 auto", padding: "100px 24px 80px", textAlign: "center" }}>
        
        {/* Hero & Waitlist Section */}
        <Reveal>
          <section style={{ textAlign: "center", marginBottom: "80px" }}>
            <h1
              style={{
                fontSize: "clamp(44px, 7vw, 76px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: "24px",
                color: "var(--text)",
              }}
            >
              Your API dependencies<br />
              <span style={{ background: "var(--gradient-brand)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                patch themselves.
              </span>
            </h1>
            <p
              style={{
                fontSize: "clamp(17px, 2.2vw, 21px)",
                color: "var(--text-secondary)",
                maxWidth: "640px",
                margin: "0 auto 32px",
                lineHeight: 1.6,
              }}
            >
              Continuous monitoring of OpenAPI changes. Automated compatibility scans. AI-generated patches delivered via verified pull requests.
            </p>

            {/* Waitlist form component */}
            <div style={{ marginBottom: "48px" }}>
              <WaitlistForm />
            </div>
          </section>
        </Reveal>

        {/* Lightweight Code Diff Proof Section */}
        <Reveal>
          <section style={{ maxWidth: "600px", margin: "0 auto 80px", textAlign: "left" }}>
            <div
              className="hover-card"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "var(--shadow-panel)",
              }}
            >
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)" }}>Real patch, real PR</span>
                <a
                  href="https://github.com/Coder3257/ravi-dev/pull/4"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "12px", color: "var(--accent)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  View PR #4
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                </a>
              </div>
              <pre style={{ margin: 0, padding: "16px 20px", fontSize: "13px", fontFamily: "var(--font-mono)", lineHeight: "1.7", overflowX: "auto" }}>
                <code style={{ display: "block", color: "var(--text-muted)" }}>
                  <span>// stripe-client.ts</span>
                  {"\n"}
                  <span style={{ display: "block", background: "var(--diff-del-bg)", color: "var(--diff-del-text)", margin: "0 -20px", padding: "0 20px" }}>
                    - const stripe = new Stripe(key, &#123; apiVersion: &apos;2023-10-16&apos; &#125;);
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px" }}>
                    + const stripe = new Stripe(key, &#123;
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px" }}>
                    +   apiVersion: &apos;2023-10-16&apos;,
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px" }}>
                    +   typescript: true
                  </span>
                  <span style={{ display: "block", background: "var(--diff-add-bg)", color: "var(--diff-add-text)", margin: "0 -20px", padding: "0 20px" }}>
                    + &#125;);
                  </span>
                </code>
              </pre>
            </div>
          </section>
        </Reveal>

        {/* How It Works Section */}
        <Reveal>
          <section style={{ padding: "60px 0 80px", borderTop: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "40px", color: "var(--text)" }}>
              How It Works
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
              {[
                {
                  step: "01",
                  title: "Detect",
                  desc: "Watches API changelogs continuously",
                  detail: "We poll Stripe OpenAPI repositories and diff new commits/tags to classify changes as breaking, deprecation, or additive.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                      <path d="M2 12h6M22 12h-6M12 2v6M12 22v-6M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0"/>
                    </svg>
                  )
                },
                {
                  step: "02",
                  title: "Patch",
                  desc: "AI writes the fix",
                  detail: "The system feeds the OpenAPI diff and the affected call sites in your code into a fine-tuned Gemini model to generate precise compatibility patches.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  )
                },
                {
                  step: "03",
                  title: "Ship",
                  desc: "Opens a verified pull request",
                  detail: "We push the code patch to a branch, run tests via the GitHub Checks API, and open a PR only after verifying your test suite is green.",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                      <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>
                    </svg>
                  )
                }
              ].map((card, i) => (
                <div
                  key={i}
                  className="hover-card"
                  onClick={() => setActiveModal({ title: card.title, content: card.detail })}
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
                  <div style={{ display: "flex", justifyContent: "center", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
                    {card.icon}
                    <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontWeight: 600 }}>{card.step}</span>
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "var(--text)", letterSpacing: "-0.01em" }}>{card.title}</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.5 }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginBottom: "80px" }}>
              <Link
                href="/dashboard"
                className="btn-hover"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "14px 28px",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#ffffff",
                  background: "var(--gradient-brand)",
                  borderRadius: "10px",
                  boxShadow: "0 4px 12px var(--accent-glow)",
                  transition: "all 0.2s",
                }}
              >
                Open Live Feed Dashboard
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>

            {/* Card-based Stat Displays */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginTop: "40px" }}>
              {[
                { stat: "Continuous", label: "Stripe changelog monitoring", detail: "The engine polls the spec multiple times a day so we catch changes before they propagate to npm packages." },
                { stat: "Zero Noise", label: "Patches only for breaking changes", detail: "Additive features are logged silently. You only get notified and receive pull requests for things that can break your build." },
                { stat: "Automated", label: "Tested pull requests in minutes", detail: "The complete cycle from changelog update to a green CI check on a pull request completes in less than an hour." },
              ].map((item, i) => (
                <div
                  key={i}
                  className="hover-card"
                  onClick={() => setActiveModal({ title: item.stat, content: item.detail })}
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
                      fontSize: "36px",
                      fontWeight: 800,
                      background: "var(--gradient-brand)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      marginBottom: "8px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {item.stat}
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: 550, letterSpacing: "0.01em" }}>{item.label}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      </main>

      {/* Detail Popup Modal */}
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

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "40px 24px", marginTop: "100px", background: "var(--bg-inset)" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "15px", letterSpacing: "-0.01em" }}>API Sentinel</span>
          <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
