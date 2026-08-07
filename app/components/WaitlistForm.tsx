"use client";

import { useState } from "react";
import styles from "./WaitlistForm.module.css";

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const locked = status === "loading" || status === "success";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || locked) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "That didn't go through. Try again.");
        return;
      }

      setStatus("success");
      setMessage("You're on the list. We'll email you when your slot opens.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className={styles.wrap}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <label htmlFor="waitlist-email" className={styles.srOnly}>
          Work email
        </label>
        <input
          id="waitlist-email"
          className={styles.input}
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={locked}
          aria-invalid={status === "error"}
        />
        <button type="submit" className={styles.submit} disabled={locked}>
          {status === "loading" ? "Adding…" : status === "success" ? "Added" : "Get early access"}
        </button>
      </form>

      {/* Height is reserved so the layout never shifts when a message lands. */}
      <div
        className={styles.messageSlot}
        role="status"
        aria-live="polite"
        data-visible={status === "success" || status === "error"}
      >
        {message && (
          <p className={styles.message} data-tone={status === "error" ? "error" : "ok"}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
