import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "API Sentinel — Ship through Stripe API changes",
  description:
    "API Sentinel watches the Stripe OpenAPI spec, detects breaking, deprecation and additive changes, and opens verified GitHub PRs that fix your code before your build breaks.",
  metadataBase: new URL("https://apisentinel.dev"),
  openGraph: {
    title: "API Sentinel — Ship through Stripe API changes",
    description:
      "Auto-fix breaking Stripe API changes before they break your build. Detect, patch, and open a verified PR — automatically.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07060d",
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
