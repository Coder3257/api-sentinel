"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Something went wrong.");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch (err: any) {
      setStatus("error");
      setErrorMessage("Connection error. Please try again.");
    }
  };

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "left" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <input
          type="email"
          required
          placeholder="Enter your work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading" || status === "success"}
          style={{
            flex: 1,
            minWidth: "240px",
            padding: "14px 16px",
            background: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            color: "#ffffff",
            fontSize: "15px",
            outline: "none",
            transition: "border-color 0.2s",
          }}
        />
        <button
          type="submit"
          disabled={status === "loading" || status === "success"}
          style={{
            padding: "14px 24px",
            background: status === "success" ? "#10b981" : "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
            border: "none",
            borderRadius: "10px",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "15px",
            cursor: (status === "loading" || status === "success") ? "not-allowed" : "pointer",
            opacity: (status === "loading" || status === "success") ? 0.7 : 1,
            boxShadow: "0 4px 12px rgba(6, 182, 212, 0.2)",
            transition: "all 0.3s ease",
          }}
        >
          {status === "loading" ? "Submitting..." : status === "success" ? "Joined!" : "Join Waitlist"}
        </button>
      </form>
      
      {/* Message Area with reserved height and opacity transition */}
      <div 
        style={{ 
          minHeight: "56px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          transition: "opacity 0.4s ease",
          opacity: status === "idle" || status === "loading" ? 0 : 1,
        }}
      >
        {status === "success" && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              padding: "12px 18px",
              borderRadius: "10px",
              color: "#10b981",
              fontWeight: 600,
              fontSize: "14px",
              width: "100%",
              textAlign: "center",
            }}
          >
            🎉 You're on the list! We'll reach out soon.
          </div>
        )}
        {status === "error" && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              padding: "12px 18px",
              borderRadius: "10px",
              color: "#ef4444",
              fontWeight: 650,
              fontSize: "14px",
              width: "100%",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <span>⚠️</span> {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
