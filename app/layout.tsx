import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import Providers from "@/app/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headings — referenced by --font-display in globals.css.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Prefer an explicit site URL; fall back to the Vercel-provided host, then local.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  title: "API Sentinel — Ship through Stripe API changes",
  description:
    "API Sentinel watches the Stripe OpenAPI spec, detects breaking, deprecation and additive changes, and opens draft PRs with AI-generated, build-tested patches for human review before merge.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: "API Sentinel — Ship through Stripe API changes",
    description:
      "Auto-fix breaking Stripe API changes before they break your build. AI-generated patch, build-tested, opened as draft PR for human review before merge.",
    type: "website",
    url: siteUrl,
    siteName: "API Sentinel",
  },
  twitter: {
    card: "summary_large_image",
    title: "API Sentinel — Ship through Stripe API changes",
    description:
      "Auto-fix breaking Stripe API changes before they break your build. AI-generated patch, build-tested, opened as draft PR for human review before merge.",
  },
};

export const viewport: Viewport = {
  themeColor: "#060707",
};

// Runs before paint to set the theme class and avoid a flash of the wrong theme.
const noFlashScript = `
(function () {
  try {
    var stored = localStorage.getItem('api-sentinel-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.classList.add(theme);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

