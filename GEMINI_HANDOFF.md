# Handoff prompt for Gemini agent — API Sentinel theme migration verification

You are a Gemini agent working on a Next.js 16 App Router codebase called **API Sentinel**. Your task is to **verify and complete** a visual redesign that's 95% done but needs a final production build to catch any remaining type errors or runtime issues.

---

## Context

The app was reskinned from a violet/indigo palette to a **dark, minimal, glass-based "instrument in a dark room" aesthetic** matching 4 reference screenshots the user provided. All major work is complete:

1. ✅ **Landing page** (`app/page.tsx` + `page.module.css`) — rewritten to use the new tokens, glass pill nav, aurora gradients, bento grid, floating shell layout
2. ✅ **DemoWidget** (`app/components/DemoWidget.tsx` + `.module.css`) — moved off inline styles to CSS module
3. ✅ **Dashboard + Connect** — all hardcoded hex colors (`#10b981`, `#ef4444`, `#f59e0b`, `#ffffff`) replaced with token refs (`var(--additive)`, `var(--breaking)`, `var(--deprecation)`, `var(--accent-contrast)`)
4. ✅ **Fonts, SEO, error pages** — Figtree display font loaded, `layout.tsx` has env-driven `metadataBase`, `sitemap.ts`, `robots.ts`, `not-found.tsx`, `error.tsx`, `opengraph-image.tsx` all created
5. ✅ **Docs** — README and DEPLOY.md rewritten to match the real architecture (no false CI-gate claims)
6. ✅ **Env audit** — `.env.local.example` updated with NextAuth + Resend blocks

The only thing **not verified** is whether the code actually compiles and builds.

---

## Your task

Run the production build and fix any errors that appear:

```bash
cd /path/to/api-sentinel   # adjust to the actual mount path
npm run build
```

If the build succeeds with no errors, you're done — report success and hand back to the user.

If the build fails:

1. **Read the error** — Next.js type errors are precise. The error will tell you the file, line, and what's wrong.
2. **Fix it** — usually a missing import, a type mismatch, or a CSS class referenced in TSX but not defined in the module. Do NOT revert the design work. Fix the error while preserving the aesthetic.
3. **Rebuild** — run `npm run build` again to verify.
4. **Repeat** until clean.

---

## Design constraints (do not violate these when fixing errors)

- **All colors come from tokens** in `app/globals.css`. Never hardcode hex. Severity colors map to: `--breaking`, `--deprecation`, `--additive`.
- **Glass morphism**: `background: var(--glass); backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border)`
- **Light pill buttons** use `background: var(--gradient-brand); color: var(--accent-contrast)` (dark ink on light pill)
- **Aurora gradients** are `radial-gradient` layers with `filter: blur(60px)` and a CSS keyframe drift animation
- The shell uses `overflow: clip` not `overflow: hidden` (hidden would break sticky nav)
- Every clickable card is a semantic `<button>` with `font: inherit; color: inherit; display: block; width: 100%` resets
- `prefers-reduced-motion` guards every animation

If a component is missing a CSS class, **create it in the corresponding `.module.css`** using the token system. Do not switch back to inline styles.

---

## Files you might need to check

- `app/page.tsx` + `app/page.module.css`
- `app/dashboard/DashboardClient.tsx`
- `app/connect/page.tsx`
- `app/components/DemoWidget.tsx` + `app/components/DemoWidget.module.css`
- `app/layout.tsx` (Figtree import)
- `app/globals.css` (token definitions)

If a type error references a missing prop, check the component's interface at the top of the file.

---

## What NOT to do

- Do not revert the design back to inline styles or hardcoded colors
- Do not remove the Figtree font import
- Do not change `overflow: clip` to `overflow: hidden`
- Do not remove `data-*` attributes — they drive CSS state
- Do not add Tailwind classes (the project uses plain CSS)

---

## After the build succeeds

Report:

```
✅ Build complete. No errors.
   Output: .next/ directory ready for deployment.
```

Then the user can deploy with confidence.

---

**Summary**: You're the cleanup crew. The design is done; you're just making sure it compiles. Fix type errors, missing imports, and CSS references. Preserve the aesthetic. Get the build green.
