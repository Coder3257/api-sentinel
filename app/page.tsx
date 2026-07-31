import Link from "next/link";
import WaitlistForm from "@/app/components/WaitlistForm";

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

      {/* Hero Section */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "1120px", margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}>
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
        <div style={{ marginBottom: "40px" }}>
          <WaitlistForm />
        </div>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginBottom: "80px" }}>
          <Link
            href="/dashboard"
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
