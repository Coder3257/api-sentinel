"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * Theme toggle button. The initial class is set by the no-FOUC inline script
 * in layout.tsx before paint; this component only reflects + mutates it.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      document.documentElement.classList.contains("light") ? "light" : "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(next);
    try {
      localStorage.setItem("api-sentinel-theme", next);
    } catch {
      /* private mode — ignore */
    }
    // keep browser chrome in sync
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#060707" : "#ffffff");
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="themeToggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span aria-hidden suppressHydrationWarning>
        {mounted && theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
