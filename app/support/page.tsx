import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";
import styles from "../page.module.css";

export default function SupportPage() {
  return (
    <div className={styles.void}>
      <div className={styles.shell}>
        {/* Navigation */}
        <div className={styles.navRow}>
          <div className={styles.navPill}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark} />
              <span className={styles.brandName}>API Sentinel</span>
            </Link>
            <div className={styles.navSpacer} />
            <div className={styles.navActions}>
              <ThemeToggle />
              <Link href="/" className={styles.btnGhost} style={{ padding: "8px 16px", textDecoration: "none", fontSize: "14px" }}>
                Home
              </Link>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className={styles.prose}>
          <h1>Support</h1>
          <p className={styles.proseMeta}>Last updated: August 5, 2026</p>

          <section>
            <h2>Contact Us</h2>
            <p>
              Have questions, feedback, or need assistance? Please email us at{" "}
              <a href="mailto:ravimahto712@gmail.com">ravimahto712@gmail.com</a>.
            </p>
            <p>
              During our beta phase, we offer best-effort response times and aim to respond to all inquiries within <strong>2 business days</strong>.
            </p>
          </section>

          <section>
            <h2>Common Issues & Troubleshooting</h2>
            
            <h3>Repository not appearing after installation?</h3>
            <p>
              If a newly connected repository does not appear in your dashboard, try reinstalling the GitHub App by going to the{" "}
              <Link href="/connect">Connect Page</Link> and clicking "Reinstall" or "Configure" to grant repository access permissions.
            </p>

            <h3>No scans run yet?</h3>
            <p>
              Scans are scheduled automatically. The background cron engine runs daily at <strong>00:00 UTC</strong> to search for new Stripe OpenAPI changes and run compatibility checks.
            </p>
          </section>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <span className={styles.brandMark} />
              API Sentinel
            </div>
            <p className={styles.disclaimer}>
              api-sentinel is an independent tool for Stripe developers. Not affiliated with or endorsed by Stripe.
            </p>
            <span className={styles.footerCopy}>&copy; {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
