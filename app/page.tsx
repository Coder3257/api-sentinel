import ThemeToggle from "./components/ThemeToggle";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} aria-hidden />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a href="#top" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden />
            <span className={styles.brandName}>API&nbsp;Sentinel</span>
          </a>
          <nav className={styles.navLinks}>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#severity">Coverage</a>
          </nav>
          <div className={styles.navActions}>
            <ThemeToggle />
            <a href="#cta" className={styles.btnGhost}>Sign in</a>
            <a href="#cta" className={styles.btnPrimary}>Connect repo</a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <a href="#how" className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden />
            Now watching the Stripe OpenAPI spec, live
          </a>
          <h1 className={styles.heroTitle}>
            Ship through Stripe API changes
            <br />
            <span className={styles.gradientText}>before they break your build</span>
          </h1>
          <p className={styles.heroSub}>
            API Sentinel watches the Stripe OpenAPI spec around the clock. When a
            breaking or deprecated change lands, it finds every line of your code
            that depends on it, writes the fix, and opens a verified pull request —
            before your next deploy ever fails.
          </p>
          <div className={styles.heroCtas}>
            <a href="#cta" className={styles.btnPrimaryLg}>
              Connect your repo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <a href="#how" className={styles.btnGhostLg}>See how it works</a>
          </div>
          <p className={styles.heroFoot}>
            Installs as a GitHub App · Read-only scan · Opens draft PRs you approve
          </p>

          {/* Signature visual — the PR it opens */}
          <div className={styles.prCard}>
            <div className={styles.prHeader}>
              <span className={styles.prIcon} aria-hidden>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /><circle cx="18" cy="6" r="3" /></svg>
              </span>
              <span className={styles.prTitle}>
                fix: migrate <code>charges.create</code> to <code>paymentIntents</code> (Stripe 2025-06)
              </span>
              <span className={`${styles.prBadge} ${styles.prBadgeReady}`}>Checks passed</span>
            </div>
            <div className={styles.prMeta}>
              <span className={`${styles.sevPill} ${styles.sevBreaking}`}>Breaking</span>
              <span className={styles.prMetaText}>opened by api-sentinel[bot] · 2 files · verified in CI</span>
            </div>
            <pre className={styles.diff}>
              <code>
                <span className={styles.diffPath}>lib/payments.ts</span>{"\n"}
                <span className={styles.diffDel}>- const charge = await stripe.charges.create({"{"}</span>{"\n"}
                <span className={styles.diffDel}>-   amount, currency: &apos;usd&apos;, source: token,</span>{"\n"}
                <span className={styles.diffDel}>- {"}"});</span>{"\n"}
                <span className={styles.diffAdd}>+ const intent = await stripe.paymentIntents.create({"{"}</span>{"\n"}
                <span className={styles.diffAdd}>+   amount, currency: &apos;usd&apos;, payment_method: token,</span>{"\n"}
                <span className={styles.diffAdd}>+   confirm: true,</span>{"\n"}
                <span className={styles.diffAdd}>+ {"}"});</span>{"\n"}
              </code>
            </pre>
          </div>
        </section>

        {/* ── Trust strip ───────────────────────────────────────────────── */}
        <section className={styles.trust}>
          <p>Built for teams shipping on Stripe</p>
          <div className={styles.trustLogos}>
            <span>Payments</span>
            <span>Billing</span>
            <span>Connect</span>
            <span>Checkout</span>
            <span>Terminal</span>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="how" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>How it works</span>
            <h2 className={styles.sectionTitle}>Four steps, zero babysitting</h2>
            <p className={styles.sectionSub}>
              From spec change to a merge-ready pull request — the whole loop runs
              on its own and stops for you only when it matters.
            </p>
          </div>
          <ol className={styles.steps}>
            {[
              { n: "01", t: "Watch the spec", d: "We diff the Stripe OpenAPI spec continuously and classify every change as breaking, deprecation, or additive." },
              { n: "02", t: "Scan your code", d: "A read-only pass over your repo maps each affected endpoint to the exact files and lines that call it." },
              { n: "03", t: "Write the fix", d: "An AI patch is generated for the impacted call sites, matching your style and the new API shape." },
              { n: "04", t: "Verify, then PR", d: "We open a draft PR, run it through the GitHub Checks API, and promote it to ready only once CI is green." },
            ].map((s) => (
              <li key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.stepTitle}>{s.t}</h3>
                <p className={styles.stepText}>{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <section id="features" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Why API Sentinel</span>
            <h2 className={styles.sectionTitle}>A safety net that writes the fix</h2>
          </div>
          <div className={styles.featureGrid}>
            {[
              { t: "Verified before ready", d: "Every patch opens as a draft and is promoted to ready-for-review only after the GitHub Checks API confirms your suite is green. No blind commits.", big: true },
              { t: "Real severity, not noise", d: "Changes are triaged as breaking, deprecation, or additive so you only get pinged for what can actually take you down." },
              { t: "Style-matched patches", d: "Fixes follow the conventions already in your codebase — not a generic rewrite." },
              { t: "Read-only by default", d: "The scan never writes to your source. It proposes; you approve and merge." },
              { t: "Deploys before it breaks", d: "The loop runs on Stripe's release cadence, so the PR is waiting before your build ever hits the new spec." },
            ].map((f, i) => (
              <article key={i} className={`${styles.feature} ${f.big ? styles.featureBig : ""}`}>
                <h3 className={styles.featureTitle}>{f.t}</h3>
                <p className={styles.featureText}>{f.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Severity / coverage band ──────────────────────────────────── */}
        <section id="severity" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Coverage</span>
            <h2 className={styles.sectionTitle}>Every change, classified</h2>
          </div>
          <div className={styles.sevGrid}>
            <div className={`${styles.sevCard} ${styles.sevCardBreaking}`}>
              <span className={`${styles.sevPill} ${styles.sevBreaking}`}>Breaking</span>
              <h3>Fix it now</h3>
              <p>Removed fields, renamed endpoints, changed types. We open a PR the moment it lands.</p>
            </div>
            <div className={`${styles.sevCard} ${styles.sevCardDep}`}>
              <span className={`${styles.sevPill} ${styles.sevDep}`}>Deprecation</span>
              <h3>Fix it soon</h3>
              <p>Endpoints on the way out. Scheduled migrations before the sunset date arrives.</p>
            </div>
            <div className={`${styles.sevCard} ${styles.sevCardAdd}`}>
              <span className={`${styles.sevPill} ${styles.sevAdd}`}>Additive</span>
              <h3>Good to know</h3>
              <p>New optional params and endpoints. Logged, never noisy — no PR unless you want one.</p>
            </div>
          </div>

          <div className={styles.statBand}>
            <div className={styles.stat}><strong>&lt; 1 hr</strong><span>from spec change to PR</span></div>
            <div className={styles.stat}><strong>100%</strong><span>patches CI-verified</span></div>
            <div className={styles.stat}><strong>0</strong><span>broken deploys from Stripe</span></div>
          </div>
        </section>

        {/* ── CTA band ──────────────────────────────────────────────────── */}
        <section id="cta" className={styles.ctaBand}>
          <div className={styles.ctaGlow} aria-hidden />
          <h2 className={styles.ctaTitle}>
            Never get paged for a Stripe change again
          </h2>
          <p className={styles.ctaSub}>
            Connect a repo in two minutes. The next breaking change shows up as a
            reviewed pull request — not a production incident.
          </p>
          <div className={styles.heroCtas}>
            <a href="#" className={styles.btnPrimaryLg}>
              Connect your repo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <a href="#how" className={styles.btnGhostLg}>Read the docs</a>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden />
            <span className={styles.brandName}>API&nbsp;Sentinel</span>
          </div>
          <p className={styles.footerCopy}>
            © {new Date().getFullYear()} API Sentinel · Ship through the changes.
          </p>
        </div>
      </footer>
    </div>
  );
}
