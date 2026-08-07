"use client";

import { useEffect } from "react";
import Link from "next/link";
import styles from "./status.module.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the failure in the browser console; server logs capture the rest.
    console.error(error);
  }, [error]);

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.code}>Unexpected error</p>
        <h1 className={styles.title}>Something broke on our side</h1>
        <p className={styles.text}>
          This one is on us, not your code. Retry the page — if it keeps failing, the incident is
          already in our logs.
        </p>
        {error.digest && <p className={styles.digest}>Reference: {error.digest}</p>}
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.primary}>
            Try again
          </button>
          <Link href="/" className={styles.secondary}>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
