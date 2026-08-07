"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import WaitlistForm from "@/app/components/WaitlistForm";
import Reveal from "@/app/components/Reveal";
import ThemeToggle from "@/app/components/ThemeToggle";
import DemoWidget from "@/app/components/DemoWidget";
import SpecTimeline from "@/app/components/SpecTimeline";
import styles from "./page.module.css";

export default function Home() {
  const [activeModal, setActiveModal] = useState<{ title: string; content: string } | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { data: session, status } = useSession();

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Escape closes the detail modal.
  useEffect(() => {
    if (!activeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeModal]);

  return (
    <div className={styles.void}>
      {/* Fixed-position chrome lives outside .shell so the shell's clipping
          can never affect it. */}
      <div className={styles.scrollProgress} style={{ width: `${scrollProgress}%` }} />

      <div className={styles.shell}>
        {/* Glass pill nav */}
        <div className={styles.navRow}>
          <div className={styles.navPill}>
            <Link href="/" className={styles.brand}>
              <span className={styles.brandMark} />
              <span className={styles.brandName}>API Sentinel</span>
            </Link>

            <nav className={styles.navLinks}>
              <a href="#how">How It Works</a>
              <a href="#features">Features</a>
              <Link href="/pricing">Pricing</Link>
            </nav>

            <div className={styles.navSpacer} />

            <div className={styles.navActions}>
              <ThemeToggle />
              {status === "authenticated" ? (
                <>
                  <span className={styles.navUser}>{session.user?.name || "User"}</span>
                  <Link href="/dashboard" className={styles.btnGhost}>
                    Dashboard
                  </Link>
                  <button onClick={() => signOut()} className={styles.btnGhost}>
                    Sign Out
                  </button>
                </>
              ) : (
                <button onClick={() => signIn("github")} className={styles.btnPrimary}>
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hero */}
        <section className={styles.hero}>
          <Reveal>
            <a href="#" className={styles.eyebrow}>
              <i className={styles.eyebrowDot} />
              Live monitoring for Stripe OpenAPI
            </a>
          </Reveal>

          <Reveal>
            <h1 className={styles.heroTitle}>
              Your API dependencies <span className={styles.heroTitleDim}>patch themselves.</span>
            </h1>
          </Reveal>

          <Reveal>
            <p className={styles.heroSub}>
              Continuous monitoring of OpenAPI changes. Automated compatibility scans.
              AI-generated patch, build-tested, opened as draft PR for human review before merge.
            </p>
          </Reveal>

          <Reveal>
            <div className={styles.heroCtas}>
              {status === "authenticated" ? (
                <Link href="/connect" className={styles.btnPrimaryLg}>
                  Get Started
                </Link>
              ) : (
                <button onClick={() => signIn("github")} className={styles.btnPrimaryLg}>
                  Get Started
                </button>
              )}
              <Link href="/dashboard" className={styles.btnGhostLg}>
                View Dashboard
              </Link>
            </div>
          </Reveal>

          <Reveal>
            <p className={styles.heroFoot}>No credit card required</p>
          </Reveal>

          {/* Aurora stage with timeline */}
          <Reveal>
            <div className={styles.heroStage}>
              <div className={styles.heroStageInner}>
                <DemoWidget />
                <SpecTimeline />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Trust */}
        <Reveal>
          <section className={styles.trust}>
            <p>Powered by real spec diffs</p>
            <div className={styles.trustLogos}>
              <span>Stripe</span>
              <span>OpenAPI</span>
              <span>GitHub Checks</span>
            </div>
          </section>
        </Reveal>

        {/* How It Works */}
        <Reveal>
          <section className={styles.section} id="how">
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>Process</p>
              <h2 className={styles.sectionTitle}>How It Works</h2>
              <p className={styles.sectionSub}>
                Three stages, fully automated. From spec change to green PR.
              </p>
            </div>

            <ol className={styles.steps}>
              {[
                {
                  num: "01",
                  title: "Detect",
                  desc: "Watches API changelogs continuously",
                  detail: "We poll Stripe OpenAPI repositories and diff new commits/tags to classify changes as breaking, deprecation, or additive.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12h6M22 12h-6M12 2v6M12 22v-6M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0 -6 0"/>
                    </svg>
                  ),
                },
                {
                  num: "02",
                  title: "Patch",
                  desc: "AI writes the fix",
                  detail: "The system feeds the OpenAPI diff and affected call sites in your code into a fine-tuned Gemini model to generate precise compatibility patches.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                  ),
                },
                {
                  num: "03",
                  title: "Ship",
                  desc: "AI-generated patch, build-tested, opened as draft PR for human review before merge.",
                  detail: "We push the code patch to a branch, run tests via the GitHub Checks API, and open a PR only after verifying your test suite is green.",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="18" r="3"/>
                      <circle cx="6" cy="6" r="3"/>
                      <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                      <path d="M6 9v12"/>
                    </svg>
                  ),
                },
              ].map((card, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={styles.step}
                    onClick={() => setActiveModal({ title: card.title, content: card.detail })}
                    aria-label={`${card.title} — read more`}
                  >
                    <span className={styles.stepHead}>
                      <span className={styles.stepIcon}>{card.icon}</span>
                      <span className={styles.stepNum}>{card.num}</span>
                    </span>
                    <span className={styles.stepTitle}>{card.title}</span>
                    <span className={styles.stepText}>{card.desc}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        {/* Roadmap */}
        <Reveal>
          <section className={styles.section} id="roadmap">
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>Timeline</p>
              <h2 className={styles.sectionTitle}>Product Roadmap</h2>
              <p className={styles.sectionSub}>
                Our development journey and next steps.
              </p>
            </div>

            <div className={styles.roadmapGrid}>
              <div className={styles.roadmapCard}>
                <span className={`${styles.roadmapPill} ${styles.roadmapNow}`}>NOW</span>
                <h3>Stripe SDK detection</h3>
              </div>
              <div className={styles.roadmapCard}>
                <span className={`${styles.roadmapPill} ${styles.roadmapNext}`}>NEXT</span>
                <h3>Expand to additional high-traffic APIs</h3>
              </div>
              <div className={styles.roadmapCard}>
                <span className={`${styles.roadmapPill} ${styles.roadmapLater}`}>LATER</span>
                <h3>Full multi-provider coverage</h3>
              </div>
            </div>
          </section>
        </Reveal>

        {/* Features bento */}
        <Reveal>
          <section className={styles.section} id="features">
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>Capabilities</p>
              <h2 className={styles.sectionTitle}>Built for production</h2>
            </div>

            <div className={styles.bento}>
              {[
                { span: 2, stat: "Continuous", label: "Stripe changelog monitoring", detail: "The engine polls the spec multiple times a day so we catch changes before they propagate to npm packages." },
                { span: 2, stat: "Zero Noise", label: "Patches only for breaking changes", detail: "Additive features are logged silently. You only get notified and receive pull requests for things that can break your build." },
                { span: 2, stat: "Automated", label: "Tested PRs in minutes", detail: "The complete cycle from changelog update to a green CI check on a pull request completes in less than an hour." },
              ].map((item, i) => (
                <button
                  key={i}
                  type="button"
                  className={`${styles.bentoCard} ${styles.bentoCard2}`}
                  onClick={() => setActiveModal({ title: item.stat, content: item.detail })}
                  aria-label={`${item.stat} — ${item.label}`}
                >
                  <span className={styles.bentoStat}>{item.stat}</span>
                  <span className={styles.bentoLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        </Reveal>

        {/* Severity grid */}
        <Reveal>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <p className={styles.kicker}>Classification</p>
              <h2 className={styles.sectionTitle}>Every change has a severity</h2>
            </div>

            <div className={styles.sevGrid}>
              <div className={`${styles.sevCard} ${styles.sevCardBreaking}`}>
                <span className={`${styles.sevPill} ${styles.sevBreaking}`}>BREAKING</span>
                <h3>Breaking</h3>
                <p>Removes fields, changes types, or invalidates existing call patterns. Requires immediate action.</p>
              </div>
              <div className={`${styles.sevCard} ${styles.sevCardDep}`}>
                <span className={`${styles.sevPill} ${styles.sevDep}`}>DEPRECATION</span>
                <h3>Deprecation</h3>
                <p>Fields or endpoints marked for removal in a future version. Plan migration before EOL.</p>
              </div>
              <div className={`${styles.sevCard} ${styles.sevCardAdd}`}>
                <span className={`${styles.sevPill} ${styles.sevAdd}`}>ADDITIVE</span>
                <h3>Additive</h3>
                <p>New endpoints, fields, or enum values. Safe to adopt when ready, no urgency.</p>
              </div>
            </div>
          </section>
        </Reveal>

        {/* CTA */}
        <Reveal>
          <section className={styles.ctaBand}>
            <div className={styles.ctaGlow} />
            <h2 className={styles.ctaTitle}>
              Stop chasing API changes. <br />Let them chase you.
            </h2>
            <p className={styles.ctaSub}>
              Join the waitlist for early access. We'll email you when your slot opens.
            </p>
            <div className={styles.ctaForm}>
              <WaitlistForm />
            </div>
          </section>
        </Reveal>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerBrand}>
              <span className={styles.brandMark} />
              API Sentinel
            </div>
            <div className={styles.footerLinks}>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/support">Support</Link>
            </div>
            <p className={styles.disclaimer}>
              api-sentinel is an independent tool for Stripe developers. Not affiliated with or endorsed by Stripe.
            </p>
            <span className={styles.footerCopy}>&copy; {new Date().getFullYear()}</span>
          </div>
        </footer>
      </div>

      {/* Modal */}
      {activeModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 id="modal-title" className={styles.modalTitle}>
              {activeModal.title}
            </h3>
            <p className={styles.modalText}>{activeModal.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}
