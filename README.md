# API Sentinel

**Ship through Stripe API changes.** API Sentinel watches the Stripe OpenAPI spec, classifies every change as breaking, deprecation, or additive, generates a patch for your code, and opens a verified GitHub pull request — before your build breaks.

---

## The problem

Stripe ships API changes continuously. Most are harmless. A few silently break production code. Today teams find out from a failing build, a Sentry alert, or a customer. Reading changelogs by hand does not scale, and neither does hoping nobody bumps a version.

## How it works

1. **Watch** — A daily cron job fetches the current Stripe OpenAPI spec and diffs it against the last snapshot.
2. **Classify** — Each change is tagged by severity: **breaking** (removals, type changes, new required fields), **deprecation** (marked-for-removal fields), or **additive** (safe new surface).
3. **Patch** — For changes affecting your repositories, Gemini generates a minimal, targeted code patch scoped to the files that actually reference the changed API.
4. **Ship** — The patch lands as a pull request on a dedicated branch, with the diff, the severity, and the reasoning in the PR body. Your CI and branch protection rules gate the merge exactly as they would for any other branch.

Nothing is force-pushed. Nothing merges itself. The PR is the artifact.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Plain CSS + CSS Modules with a token-based theme (no utility framework) |
| Database | Supabase (Postgres) |
| Auth | NextAuth with a GitHub OAuth provider |
| Repo access | GitHub App (installation tokens, per-repo scoped) || Patch generation | Google Gemini |
| Email | Resend (optional) |
| Hosting + cron | Vercel |

MVP scope is **Stripe only**. The spec-diff layer is provider-shaped so other APIs can be added, but no other provider is wired up yet.

---

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

Open <http://localhost:3000>.

Every environment variable is documented inline in `.env.local.example`. For the full provisioning walkthrough — Supabase migrations, GitHub App creation, OAuth callback URLs, cron auth — see **[DEPLOY.md](./DEPLOY.md)**.

`GET /api/status` reports which required variables are present. It reports **presence only, never values**, so it is safe to hit in production when diagnosing a misconfigured deploy.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (run this before every deploy) |
| `npm run start` | Serve the production build locally |
| `npm run lint` | ESLint |

---

## Project layout

```
app/
  page.tsx              Landing page
  dashboard/            Authenticated scan feed + connected repos
  connect/              GitHub App installation handshake
  api/
    cron/stripe-poll/   Daily spec poll (Bearer CRON_SECRET)
    webhooks/github/    Installation + push events (HMAC verified)
    repos/              Connect / disconnect
    status/             Env presence report
  components/           Shared UI (theme toggle, timeline, demo widget)
  globals.css           Design tokens — the single source of theme truth
lib/
  env.ts                Centralised env access + validation
supabase/               SQL migrations
scripts/                Local operational scripts
```

## Theming

All colour, type, spacing, and glass/blur values live as CSS custom properties in `app/globals.css`, defined once for `.dark` and once for `.light`. Components reference tokens only — never raw hex. Changing a token restyles the whole app.

Theme preference persists to `localStorage` and is applied by a small pre-paint inline script in `app/layout.tsx`, so there is no flash of the wrong theme on load.

---

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is read in server code only and must never reach a client component.
- `GITHUB_APP_PRIVATE_KEY` is stored with literal `\n` escapes and normalised server-side at signing time.
- `/api/cron/stripe-poll` **fails closed**: without a valid `CRON_SECRET` bearer token it refuses to run.
- GitHub webhooks are HMAC-verified against `GITHUB_WEBHOOK_SECRET` before the payload is trusted.
- `.env.local` is gitignored and contains live secrets. Never commit it.
