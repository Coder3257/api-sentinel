"use client";

import { useState, useEffect } from "react";
import styles from "./DemoWidget.module.css";

type Stage = "idle" | "detecting" | "patching" | "shipped";

export default function DemoWidget() {
  const [stage, setStage] = useState<Stage>("idle");
  const [diffLinesVisible, setDiffLinesVisible] = useState<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (stage === "detecting") {
      timer = setTimeout(() => {
        setStage("patching");
      }, 2000);
    } else if (stage === "patching") {
      const lineTimer = setInterval(() => {
        setDiffLinesVisible((prev) => {
          if (prev >= 5) {
            clearInterval(lineTimer);
            timer = setTimeout(() => {
              setStage("shipped");
            }, 1500);
            return 5;
          }
          return prev + 1;
        });
      }, 800);
      return () => clearInterval(lineTimer);
    }

    return () => clearTimeout(timer);
  }, [stage]);

  const handleStart = () => {
    setDiffLinesVisible(0);
    setStage("detecting");
  };

  const handleReset = () => {
    setDiffLinesVisible(0);
    setStage("idle");
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span
              className={styles.statusDot}
              data-live={stage !== "idle"}
            />
            <span className={styles.statusText}>
              {stage === "idle" && "Interactive Demo"}
              {stage === "detecting" && "Stage 1: Detecting..."}
              {stage === "patching" && "Stage 2: AI Patching..."}
              {stage === "shipped" && "Stage 3: Shipped!"}
            </span>
          </div>
          {stage === "shipped" && (
            <button onClick={handleReset} className={styles.resetBtn}>
              Reset Replay
            </button>
          )}
        </div>

        <div className={styles.body}>
          {stage === "idle" && (
            <div className={styles.idle}>
              <p className={styles.idleText}>
                Simulate how API Sentinel intercepts a breaking Stripe API change and resolves it.
              </p>
              <button onClick={handleStart} className={styles.startBtn}>
                Simulate Breaking Change
              </button>
            </div>
          )}

          {stage === "detecting" && (
            <div className={styles.detecting}>
              <div className={styles.scanner}>
                <span className={styles.scannerPulse} />
                <div className={styles.scannerCore}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
              </div>
              <p className={styles.detectTitle}>
                Scanning stripe/openapi for API changes...
              </p>
              <p className={styles.detectSub}>
                Intercepted deprecation: <code>apiVersion</code> string format deprecated in favour of Date object.
              </p>
            </div>
          )}

          {stage === "patching" && (
            <div>
              <div className={styles.patchHead}>
                <span className={styles.patchTag}>AI Generation</span>
                <span className={styles.patchPath}>src/lib/stripe-client.ts</span>
              </div>
              <pre className={styles.diff}>
                <code>
                  <span className={styles.line} data-shown={diffLinesVisible >= 1}>
                    // stripe-client.ts
                  </span>
                  <span className={`${styles.line} ${styles.lineDel}`} data-shown={diffLinesVisible >= 2}>
                    - const stripe = new Stripe(key, &#123; apiVersion: &apos;2023-10-16&apos; &#125;);
                  </span>
                  <span className={`${styles.line} ${styles.lineAdd}`} data-shown={diffLinesVisible >= 3}>
                    + const stripe = new Stripe(key, &#123;
                  </span>
                  <span className={`${styles.line} ${styles.lineAdd}`} data-shown={diffLinesVisible >= 4}>
                    +   apiVersion: &apos;2023-10-16&apos;,
                  </span>
                  <span className={`${styles.line} ${styles.lineAdd}`} data-shown={diffLinesVisible >= 5}>
                    +   typescript: true
                  </span>
                  <span className={`${styles.line} ${styles.lineAdd}`} data-shown={diffLinesVisible >= 5}>
                    + &#125;);
                  </span>
                </code>
              </pre>
            </div>
          )}

          {stage === "shipped" && (
            <div className={styles.shipped}>
              <div className={styles.shipHead}>
                <div className={styles.shipCheck}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <h4 className={styles.shipTitle}>Pull Request #4 Opened</h4>
                  <p className={styles.shipMeta}>
                    Target branch: <code>main</code> &bull; CI Checks passing
                  </p>
                </div>
              </div>

              <a
                href="https://github.com/Coder3257/ravi-dev/pull/4"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.prLink}
              >
                <div className={styles.prRow}>
                  <div>
                    <div className={styles.prRepo}>Coder3257/ravi-dev</div>
                    <h5 className={styles.prTitle}>stripe-client: fix deprecated apiVersion syntax</h5>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.prIcon}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                  </svg>
                </div>
              </a>
            </div>
          )}
        </div>
      </div>

      <p className={styles.caption}>
        * Replaying our actual PR #4 patch, generated live by the agent. This is a guided visual simulation of the live auto-patching flow.
      </p>
    </div>
  );
}
