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

  if (status === "success") {
    return (
      <div
        style={{
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "16px",
          borderRadius: "10px",
          color: "#10b981",
          fontWeight: 600,
          fontSize: "15px",
          maxWidth: "480px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        🎉 You're on the list! We'll reach out soon.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "left" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <input
          type="email"
          required
          placeholder="Enter your work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
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
          disabled={status === "loading"}
          style={{
            padding: "14px 24px",
            background: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
            border: "none",
            borderRadius: "10px",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "15px",
            cursor: status === "loading" ? "not-allowed" : "pointer",
            opacity: status === "loading" ? 0.7 : 1,
            boxShadow: "0 4px 12px rgba(6, 182, 212, 0.2)",
          }}
        >
          {status === "loading" ? "Submitting..." : "Join Waitlist"}
        </button>
      </form>
      {status === "error" && (
        <p style={{ color: "#ef4444", fontSize: "14px", marginTop: "10px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <span>⚠️</span> {errorMessage}
        </p>
      )}
    </div>
  );
}
