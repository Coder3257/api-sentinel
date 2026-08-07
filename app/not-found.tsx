import Link from "next/link";
import styles from "./status.module.css";

export default function NotFound() {
  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.code}>Error 404</p>
        <h1 className={styles.title}>This page drifted out of spec</h1>
        <p className={styles.text}>
          The route you asked for does not exist. It may have been renamed or removed.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>
            Back to home
          </Link>
          <Link href="/dashboard" className={styles.secondary}>
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
