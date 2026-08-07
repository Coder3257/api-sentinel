import Link from "next/link";
import ThemeToggle from "@/app/components/ThemeToggle";
import styles from "../page.module.css";

export default function PrivacyPolicy() {
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
          <h1>Privacy Policy</h1>
          <p className={styles.proseMeta}>Last updated: August 5, 2026</p>

          <section>
            <h2>1. Information We Collect</h2>
            <p>
              API Sentinel connects to your GitHub account to monitor dependencies and automate compatibility updates. To provide this service, we collect and store:
            </p>
            <ul>
              <li>Your GitHub account ID, login username, and email address via OAuth.</li>
              <li>Repository metadata, file paths, and configuration files necessary for code scans.</li>
            </ul>
          </section>

          <section>
            <h2>2. How We Process Your Code</h2>
            <p>
              When a compatibility scan is triggered, API Sentinel identifies affected call sites and dependency imports. We send relevant code snippets to the Google Gemini API to generate precise compatibility patches.
            </p>
          </section>

          <section>
            <h2>3. Data Storage and Third-Party Services</h2>
            <p>
              To maintain the application status and send updates:
            </p>
            <ul>
              <li>Scan records and pull request histories are stored securely in Supabase.</li>
              <li>System and alert notifications are sent via Resend.</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Sharing and Retention</h2>
            <p>
              API Sentinel does not sell or distribute your data to third parties. You can request deletion of your account and stored repository data at any time by disconnecting the repository via GitHub or by emailing support at{" "}
              <a href="mailto:ravimahto712@gmail.com">ravimahto712@gmail.com</a>.
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
