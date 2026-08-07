"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";

function ConnectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  
  const installationId = searchParams.get("installation_id");
  const [status, setStatus] = useState<"idle" | "linking" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }

    if (installationId && authStatus === "authenticated") {
      setStatus("linking");
      attemptLink();
    }
  }, [installationId, authStatus, retryCount]);

  const attemptLink = async () => {
    try {
      const res = await fetch("/api/connect/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: installationId }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
      } else {
        if (res.status === 404 && retryCount < 10) {
          // Webhook might be slightly delayed. Retry after 1.5 seconds.
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 1500);
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Failed to link your repositories.");
        }
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg("Connection error. Please try again.");
    }
  };

  if (authStatus === "loading") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px", color: "var(--text-secondary)" }}>
        Loading session...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "560px", margin: "80px auto 0", padding: "0 24px" }}>
      <div
        className="hover-card"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "40px",
          textAlign: "center",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        {status === "idle" && !installationId && (
          <div>
            <h2 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "16px", color: "var(--text)" }}>
              Connect Repository
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.6, marginBottom: "32px" }}>
              Install the API Sentinel GitHub App on your repositories to authorize automated dependency monitoring and AI patching.
            </p>
            <a
              href="https://github.com/apps/apisentinel-dev-ravi/installations/new"
              className="btn-hover"
              style={{
                display: "inline-block",
                padding: "14px 28px",
                background: "var(--gradient-brand)",
                border: "none",
                borderRadius: "10px",
                color: "var(--accent-contrast)",
                fontWeight: 600,
                fontSize: "15px",
                textDecoration: "none",
                boxShadow: "0 4px 12px var(--accent-glow)",
              }}
            >
              Install GitHub App
            </a>
          </div>
        )}

        {status === "linking" && (
          <div>
            <div style={{ position: "relative", width: "48px", height: "48px", margin: "0 auto 20px" }}>
              <span className="live-pulse" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)", opacity: 0.2 }} />
              <div style={{ position: "absolute", inset: "12px", borderRadius: "50%", background: "var(--bg-elevated)", border: "2px solid var(--accent)" }} />
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "12px", color: "var(--text)" }}>
              Linking Account...
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.5 }}>
              Waiting for GitHub installation webhook to register your repositories (attempt {retryCount + 1}/10)...
            </p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--additive-bg)", color: "var(--additive)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "12px", color: "var(--text)" }}>
              Repositories Connected!
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.5, marginBottom: "32px" }}>
              Your repositories are successfully linked to your API Sentinel account. We will begin monitoring immediately.
            </p>
            <Link
              href="/dashboard"
              className="btn-hover"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "var(--gradient-brand)",
                borderRadius: "10px",
                color: "var(--accent-contrast)",
                fontWeight: 600,
                fontSize: "14px",
                textDecoration: "none",
                boxShadow: "0 4px 12px var(--accent-glow)",
              }}
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {status === "error" && (
          <div>
            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--breaking-bg)", color: "var(--breaking)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "12px", color: "var(--text)" }}>
              Linking Failed
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.5, marginBottom: "32px" }}>
              {errorMsg}
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={() => { setRetryCount(0); setStatus("linking"); attemptLink(); }}
                className="btn-hover"
                style={{
                  padding: "12px 24px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              <Link
                href="/dashboard"
                style={{
                  padding: "12px 24px",
                  background: "none",
                  border: "1px solid transparent",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  fontSize: "14px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Skip to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", fontFamily: "var(--font-sans)", position: "relative", overflow: "hidden" }}>
      {/* Background decoration */}
      <div style={{ position: "absolute", top: "-10%", left: "50%", transform: "translateX(-50%)", width: "70vw", height: "70vw", maxWidth: "800px", maxHeight: "800px", background: "var(--gradient-hero)", borderRadius: "50%", filter: "blur(80px)", pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)", background: "var(--glass)", borderBottom: "1px solid var(--border)", padding: "16px 24px" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "var(--gradient-brand)", boxShadow: "0 0 12px var(--accent-glow)" }} />
            <span>API Sentinel</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 1 }}>
        <Suspense fallback={<div style={{ textAlign: "center", marginTop: "100px", color: "var(--text-muted)" }}>Loading...</div>}>
          <ConnectContent />
        </Suspense>
      </main>
    </div>
  );
}
