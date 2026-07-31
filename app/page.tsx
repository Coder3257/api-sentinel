import Link from "next/link";
import WaitlistForm from "@/app/components/WaitlistForm";
import Reveal from "@/app/components/Reveal";

export default function Home() {
  return (
    <div style={{ background: "#060913", color: "#f3f4f6", minHeight: "100vh", fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Dark UI Glowing Gradient Orb Accents (Cyan/Emerald) */}
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
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.04) 50%, rgba(0,0,0,0) 100%)",
          borderRadius: "50%",
          pointerEvents: "none",
          filter: "blur(80px)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "-10%",
          width: "40vw",
          height: "40vw",
          maxWidth: "500px",
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, rgba(0,0,0,0) 70%)",
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
          background: "rgba(6, 9, 19, 0.8)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
          padding: "16px 24px",
        }}
      >
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)", boxShadow: "0 0 12px rgba(6, 182, 212, 0.5)" }} />
            <span>API Sentinel</span>
          </div>
          <Link
            href="/dashboard"
            className="btn-hover"
            style={{
              padding: "10px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
              color: "white",
              transition: "all 0.2s",
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "1120px", margin: "0 auto", padding: "100px 24px 80px", textAlign: "center" }}>
        
        {/* Hero & Waitlist Section (Revealed together for flow) */}
        <Reveal>
          <section style={{ textAlign: "center", marginBottom: "80px" }}>
            <h1
              style={{
                fontSize: "clamp(44px, 7vw, 76px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
                marginBottom: "24px",
                color: "#ffffff",
              }}
            >
              Your API dependencies<br />
              <span style={{ background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                patch themselves.
              </span>
            </h1>
            <p
              style={{
                fontSize: "clamp(17px, 2.2vw, 21px)",
                color: "#9ca3af",
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
                background: "#080b15",
                border: "1px solid rgba(6, 182, 212, 0.15)",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 12px 40px rgba(6, 182, 212, 0.05)",
              }}
            >
              <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#6b7280" }}>Real patch, real PR</span>
                <a
                  href="https://github.com/Coder3257/ravi-dev/pull/4"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "12px", color: "#06b6d4", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  View PR #4
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                </a>
              </div>
              <pre style={{ margin: 0, padding: "16px 20px", fontSize: "13px", fontFamily: "var(--font-geist-mono), monospace", lineHeight: "1.7", overflowX: "auto" }}>
                <code style={{ display: "block", color: "#6b7280" }}>
                  <span>// stripe-client.ts</span>
                  {"\n"}
                  <span style={{ display: "block", background: "rgba(239, 68, 68, 0.1)", color: "#f87171", margin: "0 -20px", padding: "0 20px" }}>
                    - const stripe = new Stripe(key, &#123; apiVersion: &apos;2023-10-16&apos; &#125;);
                  </span>
                  <span style={{ display: "block", background: "rgba(16, 185, 129, 0.1)", color: "#34d399", margin: "0 -20px", padding: "0 20px" }}>
                    + const stripe = new Stripe(key, &#123;
                  </span>
                  <span style={{ display: "block", background: "rgba(16, 185, 129, 0.1)", color: "#34d399", margin: "0 -20px", padding: "0 20px" }}>
                    +   apiVersion: &apos;2023-10-16&apos;,
                  </span>
                  <span style={{ display: "block", background: "rgba(16, 185, 129, 0.1)", color: "#34d399", margin: "0 -20px", padding: "0 20px" }}>
                    +   typescript: true
                  </span>
                  <span style={{ display: "block", background: "rgba(16, 185, 129, 0.1)", color: "#34d399", margin: "0 -20px", padding: "0 20px" }}>
                    + &#125;);
                  </span>
                </code>
              </pre>
            </div>
          </section>
        </Reveal>

        {/* How It Works Section */}
        <Reveal>
          <section style={{ padding: "60px 0 80px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <h2 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "40px", color: "#ffffff" }}>
              How It Works
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
              {[
                {
                  step: "01",
                  title: "Detect",
                  desc: "Watches API changelogs continuously",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#06b6d4" }}>
                      <path d="M2 12h6M22 12h-6M12 2v6M12 22v-6M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0"/>
                    </svg>
                  )
                },
                {
                  step: "02",
                  title: "Patch",
                  desc: "AI writes the fix",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#10b981" }}>
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  )
                },
                {
                  step: "03",
                  title: "Ship",
                  desc: "Opens a verified pull request",
                  icon: (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8b5cf6" }}>
                      <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>
                    </svg>
                  )
                }
              ].map((card, i) => (
                <div
                  key={i}
                  className="hover-card"
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
                  <div style={{ display: "flex", justifyContent: "center", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
                    {card.icon}
                    <span style={{ fontSize: "13px", fontFamily: "var(--font-geist-mono), monospace", color: "#6b7280", fontWeight: 600 }}>{card.step}</span>
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px", color: "#ffffff", letterSpacing: "-0.01em" }}>{card.title}</h3>
                  <p style={{ color: "#9ca3af", fontSize: "14px", lineHeight: 1.5 }}>{card.desc}</p>
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
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  transition: "all 0.2s",
                }}
              >
                Open Live Feed Dashboard
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>

            {/* Card-based Stat Displays with Subtle Glow Borders */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginTop: "40px" }}>
              {[
                { stat: "Continuous", label: "Stripe changelog monitoring" },
                { stat: "Zero Noise", label: "Patches only for breaking changes" },
                { stat: "Automated", label: "Tested pull requests in minutes" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="hover-card"
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
                      fontSize: "36px",
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      marginBottom: "8px",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {item.stat}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: "14px", fontWeight: 550, letterSpacing: "0.01em" }}>{item.label}</div>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", padding: "40px 24px", marginTop: "100px", background: "#05070e" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "#9ca3af", fontSize: "15px", letterSpacing: "-0.01em" }}>API Sentinel</span>
          <span style={{ fontSize: "13px", color: "#4b5563" }}>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
