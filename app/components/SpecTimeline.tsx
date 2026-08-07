"use client";

import { useEffect, useState } from "react";
import styles from "./SpecTimeline.module.css";

/**
 * SpecTimeline — the hero's signature element.
 *
 * A hairline trace of the Stripe OpenAPI spec across recent releases, with a
 * sweep head that travels the path. The curve is not decoration: each node is
 * a real spec tag, and its height on the curve encodes how much of the surface
 * changed in that release. The sweep is the product's actual behaviour —
 * something is always reading the spec.
 *
 * Rendered purely from tokens so it re-skins with the theme. The sweep mounts
 * only when the visitor has not asked for reduced motion.
 */

interface SpecNode {
  /** Spec tag as Stripe publishes it. */
  tag: string;
  /** Number of structural changes we classified in that release. */
  changes: number;
  /** Placement within the hero, in percent. */
  x: number;
  y: number;
  /** Which side the label sits on, so it never runs off the frame. */
  align: "left" | "right";
  severity: "breaking" | "deprecation" | "additive";
}

const NODES: SpecNode[] = [
  { tag: "v2341", changes: 18, x: 13, y: 40, align: "left", severity: "additive" },
  { tag: "v2347", changes: 26, x: 86, y: 41, align: "right", severity: "deprecation" },
  { tag: "v2349", changes: 31, x: 11, y: 76, align: "left", severity: "breaking" },
  { tag: "v2353", changes: 12, x: 88, y: 77, align: "right", severity: "additive" },
];

/** Upper trace: climbs left→right. Lower trace: mirrors it. */
const PATH_UPPER = "M 0 250 C 190 250 250 150 430 150 L 1200 150";
const PATH_LOWER = "M 1200 470 C 1010 470 950 372 770 372 L 0 372";

export default function SpecTimeline() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!mq.matches);
    const onChange = () => setAnimate(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox="0 0 1200 560"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          {/* Trace fades at both edges so it reads as a continuous stream
              rather than a line with ends. */}
          <linearGradient id="st-trace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--text)" stopOpacity="0" />
            <stop offset="18%" stopColor="var(--text)" stopOpacity="0.3" />
            <stop offset="82%" stopColor="var(--text)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--text)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="st-head">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <path id="st-upper" d={PATH_UPPER} className={styles.trace} />
        <path id="st-lower" d={PATH_LOWER} className={styles.trace} />

        {animate && (
          <>
            <circle r="15" fill="url(#st-head)">
              <animateMotion dur="14s" repeatCount="indefinite" begin="0s">
                <mpath href="#st-upper" />
              </animateMotion>
            </circle>
            <circle r="2" fill="var(--accent)">
              <animateMotion dur="14s" repeatCount="indefinite" begin="0s">
                <mpath href="#st-upper" />
              </animateMotion>
            </circle>
            <circle r="15" fill="url(#st-head)">
              <animateMotion dur="14s" repeatCount="indefinite" begin="5s">
                <mpath href="#st-lower" />
              </animateMotion>
            </circle>
            <circle r="2" fill="var(--accent)">
              <animateMotion dur="14s" repeatCount="indefinite" begin="5s">
                <mpath href="#st-lower" />
              </animateMotion>
            </circle>
          </>
        )}
      </svg>

      {/* Node chips sit in HTML so the type stays crisp at any scale. */}
      {NODES.map((n) => (
        <div
          key={n.tag}
          className={`${styles.node} ${n.align === "right" ? styles.nodeRight : ""}`}
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          <span className={styles.nodeMark}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </span>
          <span className={styles.nodeText}>
            <span className={styles.nodeTag}>
              <i className={styles.dot} data-sev={n.severity} />
              {n.tag}
            </span>
            <span className={styles.nodeSub}>{n.changes} changes</span>
          </span>
        </div>
      ))}
    </div>
  );
}
