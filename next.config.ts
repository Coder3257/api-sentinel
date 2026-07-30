import type { NextConfig } from "next";

/**
 * Security headers applied to every route. Conservative defaults appropriate
 * for a mostly-server app with a marketing landing page + dashboard.
 *
 * Note: we intentionally do NOT set a strict Content-Security-Policy here.
 * Next.js injects inline scripts/styles (and the no-FOUC theme script uses
 * dangerouslySetInnerHTML), which a strict CSP would block without a nonce
 * pipeline. Add a nonce-based CSP later if the threat model calls for it.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // Fail the production build on type + lint errors (default, made explicit).
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
