"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";

interface Repo {
  id: string;
  owner: string;
  name: string;
  default_branch?: string | null;
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
  trigger?: "stripe" | "upgrade" | "unknown";
}

interface RepoScanStatus {
  repoId: string;
  status: string | null;
  error: string | null;
  created_at: string | null;
}

interface DashboardClientProps {
  totalRepos: number;
  totalScans: number;
  totalPRs: number;
  mergedPRs: number;
  scans: ScanRow[];
  userRepos: Repo[];
  repoScanStatuses: RepoScanStatus[];
  upgradeCandidates: any[];
}

interface RepoHealth {
  repoId: string;
  repoName: string;
  score: number | null;
  lagWeeks: number | null;
  lastScanAt: string | null;
}

export default function DashboardClient({ totalRepos, totalScans, totalPRs, mergedPRs, scans, userRepos, repoScanStatuses, upgradeCandidates }: DashboardClientProps) {
  const [activeModal, setActiveModal] = useState<{ title: string; content: string } | null>(null);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(null);
  const [upgradeDetail, setUpgradeDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [triggeringPatchId, setTriggeringPatchId] = useState<string | null>(null);

  const [liveScans, setLiveScans] = useState<any[]>([]);
  const [pollInterval, setPollInterval] = useState(8000);

  const [repoHealths, setRepoHealths] = useState<Record<string, RepoHealth>>({});
  const [expandedHealthRepoId, setExpandedHealthRepoId] = useState<string | null>(null);

  const [triggeringScanRepoId, setTriggeringScanRepoId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: "success" | "error"; repoId: string } | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Hello! I am your AI assistant. Ask me anything about your repositories, scan results, or health scores." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const [notificationPrefs, setNotificationPrefs] = useState<{
    global: { emailEnabled: boolean; webhookEnabled: boolean; webhookUrl: string | null };
    overrides: { repoId: string; emailEnabled: boolean; webhookEnabled: boolean; webhookUrl: string | null }[];
  }>({
    global: { emailEnabled: true, webhookEnabled: false, webhookUrl: null },
    overrides: [],
  });
  const [activePrefRepoId, setActivePrefRepoId] = useState<string | null>(null);
  const [prefEmailEnabled, setPrefEmailEnabled] = useState(true);
  const [prefWebhookEnabled, setPrefWebhookEnabled] = useState(false);
  const [prefWebhookUrl, setPrefWebhookUrl] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fetchNotificationPrefs = async () => {
    try {
      const res = await fetch("/api/notification-prefs");
      if (res.ok) {
        const data = await res.json();
        setNotificationPrefs(data);
      }
    } catch (err) {
      console.error("Failed to fetch notification preferences:", err);
    }
  };

  useEffect(() => {
    fetchNotificationPrefs();
  }, []);

  const handleOpenPrefs = (repoId: string) => {
    if (activePrefRepoId === repoId) {
      setActivePrefRepoId(null);
    } else {
      const override = notificationPrefs.overrides.find((o) => o.repoId === repoId);
      if (override) {
        setPrefEmailEnabled(override.emailEnabled);
        setPrefWebhookEnabled(override.webhookEnabled);
        setPrefWebhookUrl(override.webhookUrl || "");
      } else {
        setPrefEmailEnabled(notificationPrefs.global.emailEnabled);
        setPrefWebhookEnabled(notificationPrefs.global.webhookEnabled);
        setPrefWebhookUrl(notificationPrefs.global.webhookUrl || "");
      }
      setActivePrefRepoId(repoId);
    }
  };

  const handleSavePrefs = async (repoId: string) => {
    if (prefWebhookEnabled && !prefWebhookUrl.startsWith("https://")) {
      alert("Webhook URL must start with https://");
      return;
    }

    setSavingPrefs(true);
    try {
      const res = await fetch("/api/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId,
          emailEnabled: prefEmailEnabled,
          webhookEnabled: prefWebhookEnabled,
          webhookUrl: prefWebhookUrl || null,
        }),
      });

      if (res.ok) {
        await fetchNotificationPrefs();
        setActivePrefRepoId(null);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save preferences.");
      }
    } catch (err) {
      alert("Failed to save notification preferences.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatOpen]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);

    try {
      const priorHistory = chatMessages.slice(-10);
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: priorHistory,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error || "Failed to get reply."}` }]);
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Failed to connect to the assistant server." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRunScan = async (repoId: string, repoName: string) => {
    setTriggeringScanRepoId(repoId);
    setScanMessage(null);
    try {
      const res = await fetch("/api/repo-scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });

      if (res.ok) {
        fetchLiveScans();
      } else {
        const data = await res.json();
        const msg = data.error || "Failed to trigger scan.";
        setScanMessage({ text: msg, type: "error", repoId });
      }
    } catch (err) {
      setScanMessage({ text: "Connection error. Please try again.", type: "error", repoId });
    } finally {
      setTriggeringScanRepoId(null);
    }
  };

  const fetchRepoHealth = async () => {
    try {
      const res = await fetch("/api/repo-health");
      if (res.ok) {
        const data = await res.json();
        const healthMap: Record<string, RepoHealth> = {};
        data.forEach((h: RepoHealth) => {
          healthMap[h.repoId] = h;
        });
        setRepoHealths(healthMap);
      }
    } catch (err) {
      console.error("Failed to fetch repo health scores:", err);
    }
  };

  useEffect(() => {
    fetchRepoHealth();
  }, []);

  const fetchLiveScans = async () => {
    try {
      const res = await fetch("/api/pipeline-status");
      if (res.ok) {
        const data = await res.json();
        setLiveScans(data);
        fetchRepoHealth();
        
        // Check if any scan is in progress
        const hasActiveScan = data.some((scan: any) =>
          ["pending", "scanning", "patching"].includes(scan.status.toLowerCase())
        );
        setPollInterval(hasActiveScan ? 3000 : 8000);
      }
    } catch (err) {
      console.error("Failed to fetch live pipeline status:", err);
    }
  };

  useEffect(() => {
    fetchLiveScans();
  }, []);

  useEffect(() => {
    const timer = setInterval(fetchLiveScans, pollInterval);
    return () => clearInterval(timer);
  }, [pollInterval]);

  const getRelativeTime = (dateStr: string) => {
    const elapsed = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hr ago";
    if (hours < 24) return `${hours} hrs ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const fetchUpgradeDetail = async (candidateId: string) => {
    setLoadingDetail(true);
    setSelectedUpgradeId(candidateId);
    setUpgradeDetail(null);
    try {
      const res = await fetch(`/api/upgrade-detail?candidateId=${candidateId}`);
      if (res.ok) {
        const data = await res.json();
        setUpgradeDetail(data);
      } else {
        alert("Failed to load upgrade details.");
      }
    } catch (err) {
      alert("Failed to load upgrade details.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleTriggerPatch = async (candidateId: string) => {
    setTriggeringPatchId(candidateId);
    try {
      const res = await fetch("/api/trigger-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      if (res.ok) {
        alert("Patch pipeline triggered successfully! Refreshing dashboard...");
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to trigger patch pipeline.");
      }
    } catch (err) {
      alert("Failed to trigger patch pipeline.");
    } finally {
      setTriggeringPatchId(null);
    }
  };

  // Build a quick lookup: repoId → { status, error }
  const repoScanMap = new Map<string, RepoScanStatus>();
  for (const s of repoScanStatuses) {
    repoScanMap.set(s.repoId, s);
  }

  const isActiveScanStatus = (status: string | null) =>
    status === "pending" || status === "scanning" || status === "patching";

  const handleDisconnect = async (repoId: string, repoName: string) => {
    if (!window.confirm(`Are you sure you want to disconnect ${repoName}? This will unlink the repository but preserve its scan and pull request history.`)) {
      return;
    }

    setDisconnectingId(repoId);
    try {
      const res = await fetch("/api/repos/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId }),
      });

      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to disconnect repository.");
      }
    } catch (err) {
      alert("Connection error. Please try again.");
    } finally {
      setDisconnectingId(null);
    }
  };

  const getStatusDetails = (status: string) => {
    switch (status.toLowerCase()) {
      case "done":
        return "Verification completed successfully. A patch was applied and a pull request has been opened or code verified.";
      case "skipped":
        return "Scan completed. No Stripe SDK usage was detected, or the Stripe version matches the latest OpenAPI spec baseline.";
      case "no_guidance":
        return "The upgrade is real and confirmed, but the package published no usable release notes or changelog for this version jump, so no patch was attempted. This is a known limit, not an error.";
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
                <span className="live-pulse" style={{ position: "absolute", inlineSize: "100%", blockSize: "100%", borderRadius: "50%", background: "var(--additive)", opacity: 0.75 }}></span>
                <span style={{ position: "relative", display: "inline-flex", borderRadius: "50%", width: "10px", height: "10px", background: "var(--additive)" }}></span>
              </span>
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: "4px 0 0" }}>
              Real-time compatibility scanning and patching status
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ThemeToggle />
            <Link href="/pricing" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textDecoration: "none" }}>
              Pricing
            </Link>
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

        {/* Onboarding / Connection Status Banner */}
        {userRepos.length === 0 ? (
          <div
            style={{
              background: "var(--accent-glow)",
              border: "1px solid var(--border-strong)",
              borderRadius: "16px",
              padding: "24px 32px",
              marginBottom: "32px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
                No Repositories Connected
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "4px 0 0" }}>
                Install the GitHub App to enable automated dependency scans and PR updates.
              </p>
            </div>
            <Link
              href="/connect"
              className="btn-hover"
              style={{
                padding: "10px 20px",
                background: "var(--gradient-brand)",
                borderRadius: "8px",
                color: "var(--accent-contrast)",
                fontWeight: 600,
                fontSize: "14px",
                textDecoration: "none",
                boxShadow: "0 4px 12px var(--accent-glow)",
              }}
            >
              Connect Repository
            </Link>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: "32px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
                  Connected Repositories
                </h2>
                <Link
                  href="/connect"
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
                    transition: "all 0.2s",
                  }}
                >
                  + Connect Another Repository
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                {userRepos.map((repo) => {
                  const scanStatus = repoScanMap.get(repo.id);
                  const isScanning = isActiveScanStatus(scanStatus?.status ?? null);
                  const isFailed = scanStatus?.status === "failed";
                  
                  const isStuck = isScanning && scanStatus?.created_at
                    ? (Date.now() - new Date(scanStatus.created_at).getTime()) > 10 * 60 * 1000
                    : false;

                  return (
                    <div
                      key={repo.id}
                      className="hover-card"
                      style={{
                        background: "var(--bg-elevated)",
                        border: isFailed || isStuck
                          ? "1px solid color-mix(in srgb, var(--breaking) 28%, transparent)"
                          : isScanning
                          ? "1px solid var(--border-strong)"
                          : "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        boxShadow: "var(--shadow-panel)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                          </svg>
                          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                            {repo.owner}/{repo.name}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: "rgba(124, 58, 237, 0.1)",
                              color: "var(--accent)",
                              border: "1px solid rgba(124, 58, 237, 0.2)",
                              borderRadius: "4px",
                              padding: "2px 6px",
                              marginLeft: "6px",
                            }}
                          >
                            Free
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {(() => {
                            const isScanningOrTriggering = (() => {
                              if (triggeringScanRepoId === repo.id) return true;
                              const repoFullName = `${repo.owner}/${repo.name}`.toLowerCase();
                              const hasActiveLiveScan = liveScans.some(
                                (s: any) => s.repo?.toLowerCase() === repoFullName && isActiveScanStatus(s.status?.toLowerCase())
                              );
                              if (hasActiveLiveScan) return true;
                              const scanStatus = repoScanMap.get(repo.id);
                              return isActiveScanStatus(scanStatus?.status ?? null);
                            })();

                            return (
                              <>
                                <button
                                  onClick={() => handleRunScan(repo.id, `${repo.owner}/${repo.name}`)}
                                  disabled={isScanningOrTriggering}
                                  className="btn-hover"
                                  style={{
                                    padding: "6px 12px",
                                    background: "rgba(124, 58, 237, 0.1)",
                                    border: "1px solid rgba(124, 58, 237, 0.25)",
                                    borderRadius: "6px",
                                    color: "#A78BFA",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    cursor: isScanningOrTriggering ? "not-allowed" : "pointer",
                                    transition: "all 0.2s",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    opacity: isScanningOrTriggering ? 0.6 : 1,
                                  }}
                                >
                                  {triggeringScanRepoId === repo.id ? (
                                    <>
                                      <span style={{
                                        width: "12px",
                                        height: "12px",
                                        border: "2px solid #A78BFA",
                                        borderTopColor: "transparent",
                                        borderRadius: "50%",
                                        display: "inline-block",
                                        animation: "spin 0.8s linear infinite"
                                      }} />
                                      Triggering...
                                    </>
                                  ) : isScanningOrTriggering ? (
                                    "Scanning..."
                                  ) : (
                                    "Run Scan Now"
                                  )}
                                </button>

                                <div style={{ position: "relative" }}>
                                  <button
                                    onClick={() => handleOpenPrefs(repo.id)}
                                    className="btn-hover"
                                    title="Notification Preferences"
                                    style={{
                                      padding: "6px",
                                      background: activePrefRepoId === repo.id ? "rgba(124, 58, 237, 0.25)" : "rgba(255, 255, 255, 0.05)",
                                      border: "1px solid var(--border)",
                                      borderRadius: "6px",
                                      color: "var(--text-secondary)",
                                      cursor: "pointer",
                                      transition: "all 0.2s",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                  </button>

                                  {activePrefRepoId === repo.id && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "100%",
                                        right: 0,
                                        marginTop: "8px",
                                        background: "rgba(17, 12, 28, 0.98)",
                                        border: "1px solid var(--border-strong)",
                                        borderRadius: "12px",
                                        padding: "16px",
                                        zIndex: 100,
                                        width: "260px",
                                        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "12px",
                                        textAlign: "left",
                                      }}
                                    >
                                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                                        Notifications Setup
                                      </h4>

                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
                                        <input
                                          type="checkbox"
                                          checked={prefEmailEnabled}
                                          onChange={(e) => setPrefEmailEnabled(e.target.checked)}
                                          style={{ cursor: "pointer" }}
                                        />
                                        Email alerts
                                      </label>

                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer" }}>
                                        <input
                                          type="checkbox"
                                          checked={prefWebhookEnabled}
                                          onChange={(e) => setPrefWebhookEnabled(e.target.checked)}
                                          style={{ cursor: "pointer" }}
                                        />
                                        Webhook alerts
                                      </label>

                                      {prefWebhookEnabled && (
                                        <input
                                          type="text"
                                          placeholder="https://your-webhook.com"
                                          value={prefWebhookUrl}
                                          onChange={(e) => setPrefWebhookUrl(e.target.value)}
                                          style={{
                                            width: "100%",
                                            background: "rgba(255, 255, 255, 0.05)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "6px",
                                            padding: "6px 8px",
                                            color: "#fff",
                                            fontSize: "12px",
                                            outline: "none",
                                          }}
                                        />
                                      )}

                                      <button
                                        onClick={() => handleSavePrefs(repo.id)}
                                        disabled={savingPrefs}
                                        className="btn-hover"
                                        style={{
                                          padding: "8px 12px",
                                          background: "var(--gradient-brand)",
                                          border: "none",
                                          borderRadius: "6px",
                                          color: "#fff",
                                          fontSize: "12px",
                                          fontWeight: 600,
                                          cursor: "pointer",
                                          opacity: savingPrefs ? 0.7 : 1,
                                          outline: "none",
                                        }}
                                      >
                                        {savingPrefs ? "Saving..." : "Save Settings"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            );

                          })()}

                          {(() => {
                            const health = repoHealths[repo.id];
                            const score = health?.score;
                            const isScanned = score !== null && score !== undefined;

                            let badgeColor = "#9CA3AF";
                            let badgeBg = "rgba(156, 163, 175, 0.1)";
                            let badgeBorder = "1px solid rgba(156, 163, 175, 0.25)";

                            if (isScanned) {
                              if (score >= 80) {
                                badgeColor = "#10B981";
                                badgeBg = "rgba(16, 185, 129, 0.1)";
                                badgeBorder = "1px solid rgba(16, 185, 129, 0.25)";
                              } else if (score >= 50) {
                                badgeColor = "#F59E0B";
                                badgeBg = "rgba(245, 158, 11, 0.1)";
                                badgeBorder = "1px solid rgba(245, 158, 11, 0.25)";
                              } else {
                                badgeColor = "#EF4444";
                                badgeBg = "rgba(239, 68, 68, 0.1)";
                                badgeBorder = "1px solid rgba(239, 68, 68, 0.25)";
                              }
                            }

                            return (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={() => setExpandedHealthRepoId(expandedHealthRepoId === repo.id ? null : repo.id)}
                                  title={isScanned ? `Lag: ${health.lagWeeks} weeks. Last scan: ${health.lastScanAt ? new Date(health.lastScanAt).toLocaleDateString() : "—"}` : "Not scanned yet"}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "4px 10px",
                                    background: badgeBg,
                                    border: badgeBorder,
                                    borderRadius: "16px",
                                    color: badgeColor,
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.2s ease-in-out",
                                    outline: "none",
                                  }}
                                >
                                  <span style={{
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    background: badgeColor,
                                    display: "inline-block"
                                  }} />
                                  {isScanned ? `Health: ${score}` : "Not scanned yet"}
                                </button>
                                {expandedHealthRepoId === repo.id && health && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "100%",
                                      right: 0,
                                      marginTop: "6px",
                                      background: "var(--bg-elevated)",
                                      border: "1px solid var(--border)",
                                      borderRadius: "8px",
                                      padding: "10px 12px",
                                      zIndex: 10,
                                      width: "180px",
                                      boxShadow: "var(--shadow-panel)",
                                      fontSize: "11px",
                                      color: "var(--text-secondary)",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "6px",
                                      textAlign: "left",
                                    }}
                                  >
                                    {isScanned ? (
                                      <>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                          <span>Lag:</span>
                                          <span style={{ color: "var(--text)", fontWeight: 600 }}>{health.lagWeeks} weeks</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                          <span>Last scan:</span>
                                          <span style={{ color: "var(--text)", fontWeight: 600 }}>
                                            {health.lastScanAt ? new Date(health.lastScanAt).toLocaleDateString() : "—"}
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <span style={{ fontStyle: "italic" }}>No scan run yet.</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <button
                            onClick={() => handleDisconnect(repo.id, `${repo.owner}/${repo.name}`)}
                            disabled={disconnectingId === repo.id}
                            className="btn-hover"
                            style={{
                              padding: "6px 12px",
                              background: "var(--breaking-bg)",
                              border: "1px solid color-mix(in srgb, var(--breaking) 28%, transparent)",
                              borderRadius: "6px",
                              color: "var(--breaking)",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                          >
                            {disconnectingId === repo.id ? "Disconnecting..." : "Disconnect"}
                          </button>
                        </div>
                      </div>

                      {scanMessage && scanMessage.repoId === repo.id && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: scanMessage.type === "error" ? "var(--breaking)" : "var(--additive)",
                            background: scanMessage.type === "error" ? "var(--breaking-bg)" : "var(--additive-bg)",
                            border: `1px solid ${scanMessage.type === "error" ? "color-mix(in srgb, var(--breaking) 20%, transparent)" : "color-mix(in srgb, var(--additive) 20%, transparent)"}`,
                            borderRadius: "8px",
                            padding: "8px 12px",
                            lineHeight: 1.5,
                          }}
                        >
                          {scanMessage.text}
                        </div>
                      )}

                      {/* Scan status indicator on the repo card */}
                      {isScanning && !isStuck && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--accent)", fontWeight: 600 }}>
                          <span className="live-pulse" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                          Scanning&hellip; Initial scan in progress
                        </div>
                      )}

                      {isStuck && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--breaking)", fontWeight: 600 }}>
                          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--breaking)", flexShrink: 0 }} />
                          Scan may have failed - check logs
                        </div>
                      )}

                      {isFailed && (
                        <div
                          style={{
                            background: "var(--breaking-bg)",
                            border: "1px solid color-mix(in srgb, var(--breaking) 20%, transparent)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "var(--breaking)",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Scan failed:</strong>{" "}
                          {scanStatus?.error
                            ? scanStatus.error.length > 120
                              ? scanStatus.error.slice(0, 120) + "…"
                              : scanStatus.error
                            : "Unknown error — check logs."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upgrade Candidates Section */}
            <div
              style={{
                marginBottom: "48px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)", margin: 0 }}>
                Available Major Upgrades
              </h2>

              {upgradeCandidates.length === 0 ? (
                <div
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "32px",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "14px",
                  }}
                >
                  No package upgrades currently available.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                  {upgradeCandidates.map((candidate) => {
                    const repo = candidate.repo_dependencies?.repos;
                    const scan = candidate.scans?.[0];
                    const outcome = scan ? scan.status : "pending";

                    // Color mapping for status badges
                    let statusColor = "var(--text-muted)";
                    let statusBg = "var(--border-faint)";
                    let statusBorder = "var(--border)";

                    if (scan) {
                      switch (scan.status.toLowerCase()) {
                        case "done":
                          const hasPr = scan.pull_requests && scan.pull_requests.length > 0;
                          statusColor = hasPr ? "var(--additive)" : "var(--text-secondary)";
                          statusBg = hasPr ? "var(--additive-bg)" : "var(--bg-inset)";
                          statusBorder = hasPr ? "color-mix(in srgb, var(--additive) 28%, transparent)" : "var(--border)";
                          break;
                        case "failed":
                          statusColor = "var(--breaking)";
                          statusBg = "var(--breaking-bg)";
                          statusBorder = "color-mix(in srgb, var(--breaking) 28%, transparent)";
                          break;
                        case "scanning":
                        case "patching":
                          statusColor = "var(--accent)";
                          statusBg = "var(--accent-glow)";
                          statusBorder = "var(--border-strong)";
                          break;
                        case "pending":
                          statusColor = "var(--deprecation)";
                          statusBg = "var(--deprecation-bg)";
                          statusBorder = "color-mix(in srgb, var(--deprecation) 28%, transparent)";
                          break;
                        case "skipped":
                          statusColor = "var(--text-secondary)";
                          statusBg = "var(--bg-inset)";
                          statusBorder = "var(--border)";
                          break;
                        // Not an error state — the upgrade is real, we just
                        // have no notes to patch from. Deliberately neutral.
                        case "no_guidance":
                          statusColor = "var(--deprecation)";
                          statusBg = "var(--deprecation-bg)";
                          statusBorder = "color-mix(in srgb, var(--deprecation) 28%, transparent)";
                          break;
                      }
                    }

                    const badgeLabel = scan
                      ? scan.status === "done"
                        ? scan.pull_requests && scan.pull_requests.length > 0
                          ? "patched"
                          : "no change"
                        : scan.status === "no_guidance"
                          ? "no migration guide"
                          : scan.status
                      : "pending";

                    return (
                      <div
                        key={candidate.id}
                        className="hover-card"
                        onClick={() => fetchUpgradeDetail(candidate.id)}
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                          padding: "20px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          boxShadow: "var(--shadow-panel)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                          <div>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: "var(--bg-inset)",
                                border: "1px solid var(--border)",
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                marginBottom: "8px",
                              }}
                            >
                              {candidate.repo_dependencies?.ecosystem || "npm"}
                            </span>
                            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                              {candidate.repo_dependencies?.package_name}
                            </h3>
                          </div>

                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: statusBg,
                              border: `1px solid ${statusBorder}`,
                              color: statusColor,
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {badgeLabel}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>{candidate.from_version}</span>
                          <span>→</span>
                          <span style={{ fontWeight: 600, color: "var(--accent)", textShadow: "0 0 10px var(--accent-glow)" }}>{candidate.to_version}</span>
                        </div>

                        <div style={{ borderTop: "1px solid var(--border-faint)", paddingTop: "12px", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                          </svg>
                          <span>{repo ? `${repo.owner}/${repo.name}` : "unknown repo"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {totalScans === 0 ? (
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "16px",
                  padding: "48px 32px",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                  boxShadow: "var(--shadow-panel)",
                }}
              >
                <div style={{ position: "relative", width: "48px", height: "48px", margin: "0 auto 20px" }}>
                  <span className="live-pulse" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--accent)", opacity: 0.15 }} />
                  <div style={{ position: "absolute", inset: "12px", borderRadius: "50%", background: "var(--bg-elevated)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                </div>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
                  No Scans Yet
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.6, maxWidth: "420px", margin: "0 auto" }}>
                  Your repository is successfully connected and being monitored. Checks occur daily. Please check back after the next scheduled scan.
                </p>
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "48px" }}>
                  {[
                    { value: String(totalRepos), label: "Repos Monitored", subtext: "in active beta", detail: "Active GitHub repositories registered with the API Sentinel app." },
                    { value: String(totalScans), label: "Scans Run", subtext: "across connected repos", detail: "Total Stripe OpenAPI change scans executed across all monitored repos." },
                    { value: `${mergedPRs}/${totalPRs}`, label: "PRs Merged", subtext: mergedPRs === 0 ? "awaiting review" : "automated compatibility fixes", detail: "Pull requests successfully generated by our AI agent and opened on GitHub." },
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

                {/* Live Pipeline Section */}
                <section style={{ marginBottom: "48px" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
                    Live Pipeline
                    <span className="live-pulse" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />
                  </h2>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {!liveScans.some(s => ["done", "failed", "skipped", "no_guidance"].includes(s.status?.toLowerCase() || "")) && userRepos.length > 0 ? (
                      <div
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--accent)",
                          borderRadius: "12px",
                          padding: "24px",
                          textAlign: "center",
                          color: "var(--text)",
                          fontSize: "14px",
                          boxShadow: "0 0 15px rgba(124, 58, 237, 0.1)",
                        }}
                      >
                        <span className="live-pulse" style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", marginRight: "8px" }} />
                        Scanning your repository now — first results in a few minutes
                      </div>
                    ) : liveScans.length === 0 ? (
                      <div
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                          padding: "24px",
                          textAlign: "center",
                          color: "var(--text-secondary)",
                          fontSize: "14px",
                        }}
                      >
                        No active scans in the pipeline.
                      </div>
                    ) : (
                      liveScans.map((scan) => {
                        const status = scan.status.toLowerCase();
                        const isActive = ["pending", "scanning", "patching"].includes(status);
                        
                        // Dot color: yellow=pending/scanning, blue=patching, green=done+PR, gray=no_change/skipped, red=failed
                        let dotColor = "var(--text-secondary)";
                        if (status === "pending" || status === "scanning") dotColor = "#eab308"; // yellow
                        else if (status === "patching") dotColor = "#3b82f6"; // blue
                        else if (status === "done" && scan.prUrl) dotColor = "var(--additive)"; // green
                        else if (status === "done" || status === "skipped") dotColor = "var(--text-secondary)"; // gray
                        else if (status === "no_guidance") dotColor = "var(--deprecation)"; // amber, not red — known limit
                        else if (status === "failed") dotColor = "var(--breaking)"; // red

                        return (
                          <div
                            key={scan.scanId}
                            style={{
                              background: "var(--bg-elevated)",
                              border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                              borderRadius: "12px",
                              padding: "16px 20px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              position: "relative",
                              overflow: "hidden",
                              boxShadow: isActive ? "0 0 15px rgba(124, 58, 237, 0.1)" : "none",
                            }}
                          >
                            {/* Subtle scanline animation for active rows */}
                            {isActive && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: "linear-gradient(rgba(124, 58, 237, 0.03) 50%, rgba(0, 0, 0, 0) 50%)",
                                  backgroundSize: "100% 4px",
                                  animation: "scanline 10s linear infinite",
                                  pointerEvents: "none",
                                }}
                              />
                            )}

                            <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1 }}>
                              <span
                                className={isActive ? "live-pulse" : ""}
                                style={{
                                  display: "inline-block",
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  background: dotColor,
                                  boxShadow: `0 0 8px ${dotColor}`,
                                }}
                              />
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
                                  {scan.repo} — <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--accent)" }}>{scan.packageName}</span>
                                  {scan.trigger && (
                                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", marginLeft: "8px", padding: "2px 6px", background: "var(--bg-inset)", borderRadius: "4px", border: "1px solid var(--border)" }}>
                                      {scan.trigger === "stripe" ? "Stripe SDK scan" : scan.trigger === "upgrade" ? "Dependency upgrade scan" : scan.trigger}
                                    </span>
                                  )}
                                </span>
                                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                  {scan.status} {scan.error ? `— ${scan.error}` : ""}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "16px", zIndex: 1 }}>
                              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                {getRelativeTime(scan.createdAt)}
                              </span>
                              {scan.prUrl && (
                                <a
                                  href={scan.prUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "var(--accent)",
                                    textDecoration: "none",
                                    border: "1px solid var(--border-strong)",
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    background: "var(--bg-inset)",
                                  }}
                                >
                                  View PR
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Activity Feed Section */}
                <section>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: "24px" }}>
                    Recent Activity
                  </h2>

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
                          statusColor = "var(--additive)";
                          statusBg = "var(--additive-bg)";
                          statusBorder = "color-mix(in srgb, var(--additive) 28%, transparent)";
                          break;
                        case "failed":
                          statusColor = "var(--breaking)";
                          statusBg = "var(--breaking-bg)";
                          statusBorder = "color-mix(in srgb, var(--breaking) 28%, transparent)";
                          break;
                        case "scanning":
                        case "patching":
                          statusColor = "var(--accent)";
                          statusBg = "var(--accent-glow)";
                          statusBorder = "var(--border-strong)";
                          break;
                        case "pending":
                          statusColor = "var(--deprecation)";
                          statusBg = "var(--deprecation-bg)";
                          statusBorder = "color-mix(in srgb, var(--deprecation) 28%, transparent)";
                          break;
                        case "skipped":
                          statusColor = "var(--text-secondary)";
                          statusBg = "var(--bg-inset)";
                          statusBorder = "var(--border)";
                          break;
                        // Known limit, not a failure — never the breaking color.
                        case "no_guidance":
                          statusColor = "var(--deprecation)";
                          statusBg = "var(--deprecation-bg)";
                          statusBorder = "color-mix(in srgb, var(--deprecation) 28%, transparent)";
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

                            {scan.trigger && (
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  padding: "4px 10px",
                                  borderRadius: "999px",
                                  color: "var(--text-secondary)",
                                  background: "var(--bg-inset)",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                {scan.trigger === "stripe"
                                  ? "Stripe SDK scan"
                                  : scan.trigger === "upgrade"
                                  ? "Dependency upgrade scan"
                                  : scan.trigger}
                              </span>
                            )}

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
                                <div><strong>Monitored Branch:</strong> {repo?.default_branch || "unknown"}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}
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

      {/* Actionable Upgrade Candidate Detail Modal */}
      {selectedUpgradeId && (
        <div
          onClick={() => setSelectedUpgradeId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
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
              maxWidth: "680px",
              width: "calc(100% - 32px)",
              maxHeight: "90vh",
              overflowY: "auto",
              position: "relative",
              boxShadow: "var(--shadow-glow)",
              color: "var(--text)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <button
              onClick={() => setSelectedUpgradeId(null)}
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

            {loadingDetail ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px 0" }}>
                <div className="skeleton" style={{ height: "24px", width: "60%", borderRadius: "4px" }} />
                <div className="skeleton" style={{ height: "40px", width: "100%", borderRadius: "8px" }} />
                <div className="skeleton" style={{ height: "120px", width: "100%", borderRadius: "8px" }} />
              </div>
            ) : upgradeDetail ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      {upgradeDetail.candidate?.repo_dependencies?.ecosystem || "npm"}
                    </span>
                    <h3 style={{ fontSize: "24px", fontWeight: 800, margin: 0, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                      {upgradeDetail.candidate?.repo_dependencies?.package_name}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--text-muted)" }}>
                      in {upgradeDetail.candidate?.repo_dependencies?.repos?.owner}/{upgradeDetail.candidate?.repo_dependencies?.repos?.name}
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "15px", color: "var(--text-secondary)" }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{upgradeDetail.candidate?.from_version}</span>
                      <span>→</span>
                      <span style={{ fontWeight: 600, color: "var(--accent)" }}>{upgradeDetail.candidate?.to_version}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center", borderTop: "1px solid var(--border-faint)", borderBottom: "1px solid var(--border-faint)", padding: "16px 0" }}>
                  <button
                    onClick={() => handleTriggerPatch(upgradeDetail.candidate.id)}
                    disabled={triggeringPatchId === upgradeDetail.candidate.id}
                    className="btn-hover"
                    style={{
                      padding: "10px 20px",
                      background: "var(--gradient-brand)",
                      borderRadius: "8px",
                      color: "var(--accent-contrast)",
                      fontWeight: 600,
                      fontSize: "14px",
                      border: "none",
                      cursor: "pointer",
                      boxShadow: "0 4px 12px var(--accent-glow)",
                      opacity: triggeringPatchId === upgradeDetail.candidate.id ? 0.7 : 1,
                    }}
                  >
                    {triggeringPatchId === upgradeDetail.candidate.id ? "Queueing patch..." : "Trigger Patch Now"}
                  </button>

                  {upgradeDetail.pr && (
                    <a
                      href={upgradeDetail.pr.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-hover"
                      style={{
                        padding: "10px 20px",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "8px",
                        color: "var(--accent)",
                        fontWeight: 600,
                        fontSize: "14px",
                        textDecoration: "none",
                        textAlign: "center",
                      }}
                    >
                      View Pull Request
                    </a>
                  )}
                </div>

                {upgradeDetail.scan && (
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                      Scan Status
                    </h4>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: upgradeDetail.scan.status === "done" ? "var(--additive-bg)" : "var(--bg-inset)",
                          border: `1px solid ${upgradeDetail.scan.status === "done" ? "var(--additive)" : "var(--border)"}`,
                          color: upgradeDetail.scan.status === "done" ? "var(--additive)" : "var(--text-secondary)",
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {upgradeDetail.scan.status}
                      </span>
                      {upgradeDetail.scan.error && (
                        <span style={{ fontSize: "13px", color: "var(--breaking)" }}>
                          {upgradeDetail.scan.error}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Diff Preview */}
                {upgradeDetail.scan?.patch_result && (
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                      AI-Generated Patch Preview
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {upgradeDetail.scan.patch_result.map((res: any, idx: number) => (
                        <div key={idx} style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)", marginBottom: "6px" }}>
                            {res.filePath}
                          </div>
                          <pre style={{ margin: 0, padding: "8px", background: "rgba(0, 0, 0, 0.3)", borderRadius: "4px", fontSize: "12px", fontFamily: "var(--font-mono)", overflowX: "auto", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                            {res.reasoning || "Applied package upgrade changes."}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Release Notes */}
                {upgradeDetail.releaseNotes && upgradeDetail.releaseNotes.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "12px" }}>
                      Release Notes / Breaking Changes
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {upgradeDetail.releaseNotes.map((note: any, idx: number) => (
                        <div key={idx} style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "8px", padding: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                            <h5 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>
                              {note.title} ({note.version})
                            </h5>
                            {note.isMajor && (
                              <span style={{ fontSize: "10px", fontWeight: 700, background: "var(--breaking-bg)", color: "var(--breaking)", padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase" }}>
                                Major Release
                              </span>
                            )}
                          </div>
                          <pre style={{ margin: 0, padding: 0, background: "none", fontSize: "13px", fontFamily: "inherit", color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflowX: "auto", lineHeight: 1.6 }}>
                            {note.body ? note.body.slice(0, 1000) + (note.body.length > 1000 ? "..." : "") : "No body text available."}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)" }}>
                Failed to load candidate details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Chat Widget */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1000, fontFamily: "inherit" }}>
        {chatOpen ? (
          <div
            style={{
              width: "360px",
              height: "500px",
              background: "rgba(17, 12, 28, 0.95)",
              border: "1px solid var(--border-strong)",
              borderRadius: "16px",
              boxShadow: "0 12px 40px rgba(124, 58, 237, 0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px",
                background: "linear-gradient(135deg, #4c1d95, #1e1b4b)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10B981" }} />
                <span style={{ fontWeight: 700, fontSize: "14px", color: "#fff" }}>AI Assistant</span>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.6)",
                  cursor: "pointer",
                  fontSize: "18px",
                  padding: 0,
                  outline: "none",
                }}
              >
                &times;
              </button>
            </div>

            {/* Message List */}
            <div
              style={{
                flex: 1,
                padding: "16px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    background: msg.role === "user" ? "#7c3aed" : "rgba(255, 255, 255, 0.05)",
                    border: msg.role === "user" ? "none" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    padding: "10px 14px",
                    color: "#fff",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
              ))}
              {chatLoading && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px 12px 12px 2px",
                    padding: "10px 14px",
                    color: "rgba(255, 255, 255, 0.6)",
                    fontSize: "13px",
                    display: "flex",
                    gap: "4px",
                    alignItems: "center",
                  }}
                >
                  <span>Typing</span>
                  <span className="live-pulse" style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#A78BFA" }} />
                  <span className="live-pulse" style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#A78BFA", animationDelay: "0.2s" }} />
                  <span className="live-pulse" style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#A78BFA", animationDelay: "0.4s" }} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <form
              onSubmit={handleSendChatMessage}
              style={{
                padding: "12px 16px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                gap: "8px",
                background: "rgba(0, 0, 0, 0.2)",
              }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about pipeline, scans, health..."
                disabled={chatLoading}
                style={{
                  flex: 1,
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "#fff",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  background: "#7c3aed",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                  outline: "none",
                }}
              >
                Send
              </button>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #7c3aed, #4c1d95)",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: "#fff",
              outline: "none",
              transition: "transform 0.2s ease-in-out",
            }}
            className="btn-hover"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
