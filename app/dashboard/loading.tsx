export default function DashboardLoading() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text-secondary)", minHeight: "100vh", fontFamily: "var(--font-geist-sans), system-ui, -apple-system, sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        {/* Header Skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <div>
            <div style={{ width: "180px", height: "32px", background: "rgba(255,255,255,0.06)", borderRadius: "8px" }} />
            <div style={{ width: "240px", height: "16px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", marginTop: "8px" }} />
          </div>
        </div>

        {/* Stats Grid Skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px", marginBottom: "48px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(6, 182, 212, 0.1)",
                borderRadius: "16px",
                padding: "32px",
                position: "relative",
              }}
            >
              <div style={{ width: "80px", height: "36px", background: "rgba(255,255,255,0.06)", borderRadius: "8px", margin: "0 auto 8px" }} />
              <div style={{ width: "120px", height: "14px", background: "rgba(255,255,255,0.04)", borderRadius: "6px", margin: "0 auto" }} />
            </div>
          ))}
        </div>

        {/* Activity Feed Title Skeleton */}
        <div style={{ width: "150px", height: "24px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", marginBottom: "24px" }} />

        {/* Activity Feed Skeleton */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ width: "200px", height: "20px", background: "rgba(255,255,255,0.06)", borderRadius: "6px" }} />
                <div style={{ width: "100px", height: "14px", background: "rgba(255,255,255,0.04)", borderRadius: "6px" }} />
              </div>
              <div style={{ width: "80px", height: "24px", background: "rgba(255,255,255,0.05)", borderRadius: "6px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
