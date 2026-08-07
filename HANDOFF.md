# API Sentinel — Handoff Document

_Last updated: 2026-08-06._

---

## 1. What This App Does
API Sentinel is an automated developer assistant that detects breaking changes and deprecations in the Stripe API, scans linked GitHub repositories for affected Stripe SDK usage, and automatically generates code fixes using Google Gemini. The system then builds a fix branch and submits a unified pull request to the user's repository, notifying them via email or webhook once a compatibility fix is ready.

---

## 2. Stack
- **Framework**: Next.js (App Router) on Vercel
- **Database**: Supabase (PostgreSQL)
- **Repository Access**: GitHub App (for commit access and webhook ingestion)
- **Authentication**: GitHub OAuth via NextAuth
- **AI Engine**: Google Gemini API (`gemini-2.5-flash` model for structured patches and interactive chat)
- **Email Dispatch**: Resend API
- **Webhooks**: Custom payload delivery to user-defined HTTPS webhooks

---

## 3. Core Pipeline Flow
1. **Trigger Scan**: Initiated via cron schedule, webhook push, or manual dashboard trigger.
   - Files: [stripe-poll/route.ts](file:///c:/Users/Aman/api-sentinel/app/api/cron/stripe-poll/route.ts), [trigger/route.ts](file:///c:/Users/Aman/api-sentinel/app/api/repo-scan/trigger/route.ts)
2. **Repo Scanner**: Downloads the directory tree from GitHub.
   - File: [repo-scanner.ts](file:///c:/Users/Aman/api-sentinel/lib/github/repo-scanner.ts)
3. **Stripe Usage Detection**: Parses `package.json` manifests and scans source files for imports.
   - File: [repo-scanner.ts](file:///c:/Users/Aman/api-sentinel/lib/github/repo-scanner.ts)
4. **Changelog Diff**: Compares public Stripe OpenAPI specifications to compile version deltas.
   - File: [changelog.ts](file:///c:/Users/Aman/api-sentinel/lib/stripe/changelog.ts)
5. **AI Patch Generation**: Prompts Google Gemini with file context and version logs to write a clean diff.
   - File: [patch-generator.ts](file:///c:/Users/Aman/api-sentinel/lib/ai/patch-generator.ts)
6. **Verification (not performed in-pipeline)**: Patches are opened as draft PRs without automated verification. The PR body states whether the target repo has CI workflows that will check the change.
   - File: [patch-generator.ts](file:///c:/Users/Aman/api-sentinel/lib/ai/patch-generator.ts)
7. **PR Opener**: Creates a Git branch, commits changes atomically, and opens a GitHub Pull Request.
   - File: [pr-opener.ts](file:///c:/Users/Aman/api-sentinel/lib/github/pr-opener.ts)
8. **Notification Dispatch**: Dispatches email alerts and/or POSTs JSON payloads to user webhooks.
   - Files: [notify.ts](file:///c:/Users/Aman/api-sentinel/lib/email/notify.ts), [notify.ts](file:///c:/Users/Aman/api-sentinel/lib/webhook/notify.ts)

---

## 4. Auth Model
- Users log in via **GitHub OAuth (NextAuth)**.
- Authentication establishes a session providing a unique `user_id`.
- The `repos` table links connected GitHub App installations to this session via the `user_id` column.
- All per-repository actions (scans, details, disconnects, preferences) enforce an ownership chain check matching the authenticated session's `user_id` against the target repository's owner field.

---

## 5. API Routes
All files under `app/api/`:
- `GET /api/assistant/chat`: (None)
- `POST /api/assistant/chat`: Evaluates user query and replies using Gemini context. (Auth: Session required)
- `GET /api/auth/[...nextauth]`: NextAuth callback handlers for GitHub OAuth login. (Auth: Public)
- `POST /api/connect/link`: Pairs a GitHub App installation with the signed-in user's profile. (Auth: Session required)
- `GET /api/cron/dependency-patch`: Cron endpoint to execute pending dependency scans. (Auth: CRON_SECRET token required)
- `GET /api/cron/dependency-scan`: Cron endpoint to scan all connected repos for major upgrades. (Auth: CRON_SECRET token required)
- `GET /api/cron/stripe-poll`: Cron endpoint to poll Stripe OpenAPI specs for new changelogs. (Auth: CRON_SECRET token required)
- `POST /api/dev/run-pipeline`: Dev-only local pipeline executor. (Auth: Local/Bypassed in dev, 404 in production)
- `GET /api/health`: Basic health-check endpoint. (Auth: Public)
- `GET /api/notification-prefs`: Retrieves global and repo-specific email/webhook settings. (Auth: Session required)
- `POST /api/notification-prefs`: Updates notification settings for a repo or global fallback. (Auth: Session required)
- `GET /api/pipeline-status`: Retrieves the 10 most recent scans for the user's repos. (Auth: Session required)
- `GET /api/repo-health`: Returns lag statistics and computed health scores for user's repositories. (Auth: Session required)
- `POST /api/repo-scan/trigger`: Enforces 60s rate limit and triggers background pipelines. (Auth: Session required)
- `POST /api/repos/disconnect`: Unlinks a repository from the user's dashboard. (Auth: Session required)
- `GET /api/status`: Internal DB connection and workspace state. (Auth: Public)
- `POST /api/trigger-patch`: Enqueues manual patch tasks. (Auth: Session required)
- `GET /api/upgrade-detail`: Retrieves detailed changelog & AI logs for a specific upgrade. (Auth: Session required)
- `POST /api/waitlist`: Records waitlist emails from the landing page. (Auth: Public)
- `POST /api/webhooks/github`: Receives installation and repository webhooks from GitHub. (Auth: HMAC-SHA256 GitHub signature)

---

## 6. DB Tables
- `users`: User profiles created via NextAuth sign-in. Key columns: `id`, `github_id`, `github_username`, `email`.
- `repos`: Linked repositories connected by the GitHub App. Key columns: `id`, `github_repo_id`, `owner`, `name`, `installation_id`, `user_id`.
- `stripe_changelogs`: Cached OpenAPI tag versions. Key columns: `id`, `entry_id`, `title`, `published_at`, `severity`, `raw_diff`.
- `scans`: Observability log for repository checks. Key columns: `id`, `repo_id`, `changelog_id`, `upgrade_candidate_id`, `status`, `affected_files`, `patch_result`.
- `pull_requests`: Records of opened PRs. Key columns: `id`, `scan_id`, `github_pr_id`, `pr_url`, `branch_name`, `status`.
- `repo_dependencies`: Scanned manifest dependencies. Key columns: `id`, `repo_id`, `ecosystem`, `package_name`, `declared_range`, `resolved_version`.
- `upgrade_candidates`: Actionable package upgrades. Key columns: `id`, `dependency_id`, `from_version`, `to_version`, `breaking_confirmed`.
- `notification_prefs`: Email & webhook alert settings. Key columns: `id`, `user_id`, `repo_id`, `email_enabled`, `webhook_url`, `webhook_enabled`.

---

## 7. Known Unresolved Items
- **`repo-scanner.ts` package.json detection**: Now fully resolved. It uses `f.path === "package.json" || f.path?.endsWith("/package.json")` which correctly scans subfolders for nested node projects rather than failing on root-only matching.
- **Manual trigger scan route timeout**: `app/api/repo-scan/trigger/route.ts` has `maxDuration = 60`. While small repos run under 30s, large codebase scans (combining package checks, AST analysis, and Gemini calls) are at risk of Vercel Hobby timeouts.
- **Database migrations**: Migration [008_notification_preferences.sql](file:///c:/Users/Aman/api-sentinel/supabase/migrations/008_notification_preferences.sql) is pending manual execution in the Supabase SQL Editor.
- **Disconnect testing**: The `/api/repos/disconnect` endpoint unlinks the repo from the database, but destructive validation on cascading downstream records remains untested.
- **Missing in-pipeline verification**: There is no automated build/test check run on generated patches inside the Next.js pipeline because the 60-second Hobby cap cannot reliably fit a 90-150s clone-install-test lifecycle. Changes are instead opened directly as draft PRs.

---

## 8. Env Vars Required
- **Shared (`.env.local` + Vercel Settings)**:
  - `GITHUB_CLIENT_ID`: GitHub OAuth app Client ID.
  - `GITHUB_CLIENT_SECRET`: GitHub OAuth app Secret.
  - `GITHUB_APP_ID`: GitHub App unique ID.
  - `GITHUB_APP_PRIVATE_KEY`: RSA private key (with escaped `\n`).
  - `GITHUB_WEBHOOK_SECRET`: Secure webhook verification key.
  - `NEXT_PUBLIC_GITHUB_APP_SLUG`: GitHub App URL slug.
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project url.
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role API key.
  - `GOOGLE_AI_API_KEY`: Google Gemini API key.
  - `CRON_SECRET`: Bearer auth token for cron endpoints.
  - `NEXTAUTH_SECRET`: NextAuth session key.
  - `NEXTAUTH_URL`: Canonical site URL.
  - `RESEND_API_KEY`: Resend service token.
  - `RESEND_FROM_EMAIL`: Verified sender email address.

---

## 9. Local Dev Setup
```bash
# 1. Install dependencies
npm install

# 2. Build local environment
cp .env.local.example .env.local
# (Fill in all variables)

# 3. Compile and build Next.js application
npm run build

# 4. Start developer server
npm run dev

# 5. Boot smee proxy for GitHub webhooks
npx smee-client --url https://smee.io/YOUR_CHANNEL_ID --target http://localhost:3000/api/webhooks/github
```
