# API Sentinel — Handoff Document

_Last updated: 2026-07-29. Covers Pieces 1–5 (built + tested). Piece 6+ pending._

---

## What This Is

A Next.js app (Vercel) that:

1. Polls the Stripe OpenAPI spec on GitHub for breaking changes
2. Diffs adjacent spec versions to classify changes as `breaking | deprecation | additive`
3. Scans customer repos for Stripe SDK usage via a GitHub App (not PAT)
4. Uses an AI model to generate source patches for affected files
5. Opens a fix PR on the customer repo automatically

**MVP scope: Stripe SDK only. One test repo. No auth UI, no billing, no multi-API support.**

---

## Stack — All Decisions Locked

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js (App Router) on Vercel | Route handlers for webhooks + cron; serverless-native |
| Database | Supabase (PostgreSQL) | RLS, service-role bypass, easy dashboard inspection |
| Repo access | **GitHub App** (not PAT) | App-level permissions, multi-repo, no user token expiry |
| Changelog source | **`stripe/openapi` GitHub diffs** (`spec3.json`) | Machine-readable, no scraping, deterministic |
| AI provider | **Google Gemini API** (switched from Anthropic — see §Piece 6) | Anthropic key invalid; avoid managing two providers |
| Cron | Vercel Cron (Hobby: daily `0 0 * * *`) | Matches Hobby plan limits |
| Language | TypeScript throughout | Type safety for spec diffing and patch results |
| HTTP | Native `fetch` (Node 18+) | No axios/got needed; used for GitHub raw + Gemini API |

---

## Architecture

```
Vercel (Next.js App Router)
│
├── app/api/webhooks/github/route.ts   ← GitHub App webhook (HMAC-verified)
│       Handles: installation.created/deleted, installation_repositories
│       Writes to: repos table
│
├── app/api/cron/stripe-poll/route.ts  ← Daily cron (CRON_SECRET protected)
│       Calls: fetchNewChangelogEntries → scanRepoForStripeUsage
│            → generatePatch → openPR
│       Writes to: stripe_changelogs, scans, pull_requests tables
│
└── app/api/trigger-scan/route.ts      ← Dev-only manual trigger (Piece 8)

lib/
├── stripe/changelog.ts     Fetches stripe/openapi tags, diffs spec3.json
├── github/
│   ├── app-auth.ts         GitHub App JWT → installation token (cached)
│   ├── repo-scanner.ts     Git tree fetch → Stripe import detection
│   └── pr-opener.ts        Branch + commit + PR via GitHub Contents API
├── ai/
│   └── patch-generator.ts  Gemini API → patched file content + reasoning
└── supabase/client.ts      Service-role singleton (bypasses RLS)

supabase/migrations/
├── 001_init.sql    4 tables: repos, stripe_changelogs, scans, pull_requests
└── 002_rls.sql     RLS enabled (deny-all for anon/auth; service role bypasses)
```

---

## Supabase Schema

### `repos`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `github_repo_id` | BIGINT UNIQUE | GitHub's immutable repo ID |
| `owner` | TEXT | e.g. `Coder3257` |
| `name` | TEXT | e.g. `ravi-dev` |
| `installation_id` | BIGINT | GitHub App installation ID |
| `default_branch` | TEXT | default `'main'` |
| `created_at` | TIMESTAMPTZ | |

### `stripe_changelogs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `entry_id` | TEXT UNIQUE | Git tag name e.g. `v2347` |
| `title` | TEXT | `Stripe OpenAPI v2347` |
| `published_at` | TIMESTAMPTZ | Discovery time |
| `severity` | TEXT | `breaking \| deprecation \| additive` |
| `raw_diff` | TEXT | JSON-serialised `SpecChange[]` |
| `summary` | TEXT | AI plain-English summary (filled by Piece 8) |

### `scans`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `repo_id` | UUID FK → repos | |
| `changelog_id` | UUID FK → stripe_changelogs | |
| `status` | TEXT | `pending\|scanning\|patching\|done\|failed\|skipped` |
| `affected_files` | JSONB | `[{path, reason}]` |
| `patch_result` | JSONB | `[{filePath, patchedContent, reasoning}]` |
| `error` | TEXT | last error message |
| UNIQUE | `(repo_id, changelog_id)` | no duplicate scans |

### `pull_requests`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `scan_id` | UUID FK → scans | |
| `github_pr_id` | BIGINT UNIQUE | set after GitHub confirms |
| `pr_url` | TEXT | |
| `branch_name` | TEXT | `api-sentinel/stripe-fix-<ts>` |
| `status` | TEXT | `open\|merged\|closed` |

RLS: **enabled on all 4 tables, no policies** — deny-all for anon/authenticated. Service role (server-side only) bypasses RLS.

---

## Key Runtime Values

| Item | Value |
|------|-------|
| GitHub App ID | `4423996` |
| GitHub App Name | `apisentinel-dev-ravi` |
| Installation ID (active) | `149830581` |
| Test repo | `Coder3257/ravi-dev` |
| `github_repo_id` | `1270848692` |
| Supabase project URL | `https://dxqsitjnnieekbicgruu.supabase.co` |
| Stripe OpenAPI latest tag (baseline) | `v2347` |
| smee.io channel (local dev) | `https://smee.io/hMnFqAswPRy7bbz` |

---

## Environment Variables

See [`.env.local.example`](.env.local.example) for the full template.

| Variable | Status |
|----------|--------|
| `GITHUB_APP_ID` | ✅ Set |
| `GITHUB_APP_PRIVATE_KEY` | ✅ Set (PEM, `\n`-escaped) |
| `GITHUB_WEBHOOK_SECRET` | ✅ Set (random 32-byte hex) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `GOOGLE_AI_API_KEY` | ⏳ Needed for Piece 6 |
| `ANTHROPIC_API_KEY` | ❌ Key invalid — switched to Gemini |
| `CRON_SECRET` | ⏳ Needed for Piece 8 |

---

## What's Built (Pieces 1–5)

### ✅ Piece 1 — Schema + Project Init
- Next.js App Router scaffolded
- `supabase/migrations/001_init.sql` — 4 tables with indexes and `updated_at` trigger
- `supabase/migrations/002_rls.sql` — RLS enabled, no policies
- `.env.local.example` — all vars documented
- `vercel.json` — daily cron at `0 0 * * *`
- **Applied to Supabase: confirmed in dashboard**

### ✅ Piece 2 — GitHub App Auth (`lib/github/app-auth.ts`)
- `getInstallationToken(installationId)` — JWT → token exchange via `@octokit/auth-app`
- `getInstallationOctokit(installationId)` — returns typed Octokit instance
- Module-level factory cache (token reuse across warm invocations)
- Private key `\n` normalisation handles Vercel env encoding
- **Test passed:** `ghs_4423...` token obtained, `Coder3257/ravi-dev` listed

### ✅ Piece 3 — Stripe Changelog Fetcher (`lib/stripe/changelog.ts`)
- `fetchRecentTags(n)` — GitHub API tags endpoint (public, unauthenticated)
- `fetchSpec(ref)` — raw.githubusercontent.com download (no API rate limit)
- `diffSpecs(old, new)` — structural JSON diff across paths + component schemas
- Detects: path added/removed, method added/removed, schema added/removed, property added/removed, type changes, required-field additions, deprecation toggles
- `fetchNewChangelogEntries(lastSeenId)` — full pipeline with baseline handling
- **Test passed:** tags `v2343–v2347` fetched, `v2346→v2347` diff ran clean (0 changes = identical patch release)

### ✅ Piece 4 — GitHub App Webhook Handler (`app/api/webhooks/github/route.ts`)
- HMAC-SHA256 verification with `timingSafeEqual` (timing-oracle safe)
- `installation.created` → upsert repos to Supabase
- `installation.deleted` → delete all repos for installation
- `installation_repositories.added/removed` → upsert / delete individual repos
- `push` → logged only (scan wired in Piece 8)
- Returns 500 on handler errors so GitHub retries
- Also built: `lib/supabase/client.ts` — service-role singleton
- **Test passed:** `installation.deleted` + `installation.created` both received via smee.io, row upserted in `repos` table, 200 responses confirmed

### ✅ Piece 5 — Repo Scanner (`lib/github/repo-scanner.ts`)
- `scanRepoForStripeUsage(installationId, owner, repo, branch)`
- One API call for recursive file tree (`git.getTree` with `recursive: '1'`)
- Checks `package.json` for `stripe` dependency (known minor bug: doesn't detect if `package.json` isn't at exact tree root — non-blocking)
- Batch-downloads source files (10 at a time), regex-tests for Stripe imports
- Hard cap: 150 files max per scan
- Returns `{ hasStripeDependency, stripeVersion, files: ScannedFile[], scanTruncated }`
- **Test passed:** `src/lib/stripe-client.ts` detected (`import Stripe from 'stripe'` matched), loaded from real Supabase DB row

---

## What's Next (Pieces 6–8)

### 🔲 Piece 6 — AI Patch Generator (`lib/ai/patch-generator.ts`)

**Provider switched: Gemini API (not Anthropic).**

Anthropic key `sk-ant-api03-esMj...` is invalid/dead. Rather than managing two AI provider keys, Piece 6 will be rewritten to use the **Google Gemini API** (`@google/generative-ai` or `@google-genai/sdk`).

Plan:
- Install `@google/generative-ai`
- Fill `GOOGLE_AI_API_KEY` in `.env.local`
- Model: `gemini-2.5-pro` (or `gemini-2.0-flash` as fallback)
- Same interface: `generatePatch(input: PatchInput): Promise<PatchResult>`
- Same prompt design (strict JSON output, no markdown fences)
- Same test script structure — fetches `src/lib/stripe-client.ts` live, sends mock Stripe v15 breaking change, prints patched content + diff preview

> [!NOTE]
> The existing `lib/ai/patch-generator.ts` is written against `@anthropic-ai/sdk`.
> It will be **replaced** (not extended) in Piece 6 with the Gemini implementation.
> The `@anthropic-ai/sdk` package is installed but unused — can be removed after Piece 6 lands.

### 🔲 Piece 7 — PR Opener (`lib/github/pr-opener.ts`)
- Creates branch `api-sentinel/stripe-fix-<timestamp>`
- Commits each patched file via GitHub Contents API (no `git clone`)
- Opens PR with structured body: breaking change summary + per-file reasoning
- Writes PR record to `pull_requests` table

### 🔲 Piece 8 — Cron Route + Full Pipeline Wiring
- `app/api/cron/stripe-poll/route.ts` — CRON_SECRET check → `fetchNewChangelogEntries` → scan all repos → generate patches → open PRs
- `app/api/trigger-scan/route.ts` — dev-only manual trigger (bypasses cron schedule)
- End-to-end test: manually trigger → PR appears on `Coder3257/ravi-dev`

---

## How to Run Locally

```bash
# 1. Install deps
npm install

# 2. Start dev server
npm run dev

# 3. Start smee proxy (separate terminal, for webhook testing)
npx smee-client --url https://smee.io/hMnFqAswPRy7bbz --target http://localhost:3000/api/webhooks/github

# 4. Run individual piece test scripts
npx tsx --env-file=.env.local scripts/test-github-auth.ts 149830581
npx tsx --env-file=.env.local scripts/test-stripe-changelog.ts
npx tsx --env-file=.env.local scripts/test-repo-scanner.ts
npx tsx --env-file=.env.local scripts/test-patch-generator.ts   # needs GOOGLE_AI_API_KEY
```

---

## Known Issues / Deferred

| Issue | Severity | Deferred to |
|-------|----------|-------------|
| `hasStripeDependency` false even when `package.json` has stripe dep (root path detection bug) | Low | Post-MVP |
| Stripe `installation.created` with "All repositories" sends no repo list — repos only appear after first push | Low | Piece 8 (scanner handles it) |
| `audit` shows 12 high severity vulns (transitive, not in app code) | Low | Post-MVP |
| `ANTHROPIC_API_KEY` set but invalid — package installed unused | Cosmetic | Clean up after Piece 6 |

---

## Pieces 7–8 — PR Opener + Pipeline Wiring (built 2026-07-29)

### Piece 7 — PR opener (`lib/github/pr-opener.ts`)
Turns AI patches into a real GitHub PR via GitHub App auth. Uses the **Git Data API**
(blob → tree → commit → ref → PR) so all changed files land in **one atomic commit**.
- `openFixPr(input)` — GitHub side only, no DB. Filters to `patch.changed` files
  (throws if none). Bot identity `api-sentinel[bot] <bot@apisentinel.dev>`.
  Branch `api-sentinel/stripe-fix-<epoch>`. Title `fix: <summary≤68 chars>`.
  Returns `{ githubPrId, prNumber, prUrl, branchName, committedFiles }`.
- `recordPullRequest(scanId, pr)` — inserts into `pull_requests` (status `open`).
- `openAndRecordFixPr(input, scanId?)` — wrapper; DB write only if scanId given.
- Test: `npx tsx --env-file=.env.local scripts/test-pr-opener.ts` (opens a real PR
  writing `api-sentinel-demo/PATCH_DEMO.md` — close/delete branch after).

### Piece 8 — pipeline orchestrator + cron
- `lib/pipeline/run-pipeline.ts` — pure library (no Request/Response). `runPipeline(lastSeenEntryId)`
  and `runPipelineFromDb()` (reads high-water mark from newest `stripe_changelogs` row).
  Flow: fetch new changelog entries → upsert `stripe_changelogs` → load `repos` →
  for each (repo × actionable entry) get-or-create a `scans` row and drive it
  `pending → scanning → patching → done | skipped | failed`, opening + recording a PR
  when files change. Returns a structured `PipelineResult` (counts + per-scan reports).
- `app/api/cron/stripe-poll/route.ts` — GET, matches `vercel.json` cron path. **Fail-closed**
  `CRON_SECRET` Bearer check (timing-safe); refuses to run if the secret is unset.
  `runtime=nodejs`, `maxDuration=300`.
- `app/api/dev/run-pipeline/route.ts` — POST, **404 in production**. Manual local trigger;
  optional `{ "lastSeenEntryId": "v2347" }` body to force a baseline.
- Test: `npx tsx --env-file=.env.local scripts/test-pipeline.ts [v2347|--baseline]`.

### Defaults chosen autonomously (per "decide and build")
- **Only `breaking` + `deprecation` entries trigger scans/PRs.** `additive` changes are
  persisted to `stripe_changelogs` for the record but never open a PR (can't break a build).
- **`scans` row = unit of idempotency + observability.** `UNIQUE(repo_id, changelog_id)`
  means re-running the cron won't double-scan/double-PR a pair already in a terminal state
  (`done`/`skipped` are short-circuited on re-run).
- **Per-pair failure isolation:** one repo/entry error is caught, recorded on its scan row
  as `failed`, and never aborts the rest of the run.
- **No stripe dep or no matching files → `skipped`** (not failed). **Patched but nothing
  changed → `done` / `no_change`** (no empty PR).
- **`changesSummary`** is derived from the first breaking change + a `(+N more)` suffix.
- **Webhook `push` → re-scan is intentionally NOT wired** (still logged only). Cron is the
  core path for MVP; push-triggered scans are post-MVP to avoid gold-plating.

### Verification status
- All new files **parse-clean** via pure-JS TypeScript compiler API. Cross-file export/import
  names verified against source. `@/*` alias confirmed in tsconfig.
- **`next build` still UNVERIFIED in sandbox** (`--unshare-net` + win32 node_modules). Live
  test scripts (network + GitHub + Gemini + Supabase) also cannot run here.
- **Must run on host before calling "done":** `npm install && npm run build` (exit 0), then
  `npx tsx --env-file=.env.local scripts/test-pr-opener.ts` and
  `npx tsx --env-file=.env.local scripts/test-pipeline.ts v2347`.
- New env var required in prod: **`CRON_SECRET`** (Vercel sends it as the cron Bearer token).
