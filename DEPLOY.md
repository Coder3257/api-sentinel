# DEPLOY.md

Complete provisioning walkthrough. Sets up Supabase, both GitHub integrations (App + OAuth), email, AI, cron auth, and the production environment variables.

---

## Prerequisites

- Node.js 18+ and npm
- A Vercel account (free tier works)
- A Supabase account
- A GitHub account (to create the GitHub App + OAuth app)
- A Google Cloud account (for Gemini API key)
- (Optional) A Resend account for email notifications

---

## 1. Supabase — Database + Auth

### 1.1 Create a Supabase project

1. Go to <https://supabase.com/dashboard>
2. **New Project** → name it, pick a region, set a database password (save it).
3. Wait ~2 minutes for provisioning.

### 1.2 Run migrations

From the **SQL Editor** in the Supabase dashboard, paste and run each file in `supabase/migrations/` in chronological order. Each migration is idempotent and can be re-run safely.

Alternatively, if you have the Supabase CLI installed:

```bash
supabase db push
```

### 1.3 Copy connection strings

Go to **Project Settings** → **API**:

- **URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
- **service_role key** (under "Project API keys") → this is `SUPABASE_SERVICE_ROLE_KEY` (server-only, bypasses RLS)

---

## 2. GitHub App — Repo access for the pipeline

The GitHub App gives API Sentinel read/write access to user repositories so it can commit patches and open pull requests.

### 2.1 Create the app

1. Go to <https://github.com/settings/apps/new>
2. Fill in:
   - **GitHub App name**: `api-sentinel` (or your preferred unique name)
   - **Homepage URL**: `https://your-domain.com`
   - **Callback URL**: leave blank (not OAuth, we use installation tokens)
   - **Webhook URL**: `https://your-domain.com/api/webhooks/github`
   - **Webhook secret**: generate one with `openssl rand -hex 32` → save it as `GITHUB_WEBHOOK_SECRET`

3. **Permissions** (Repository):
   - **Contents**: Read & Write (to commit patches)
   - **Metadata**: Read-only (to list repos)
   - **Pull requests**: Read & Write (to open PRs)

4. **Subscribe to events**:
   - Installation
   - Installation repositories
   - Push

5. **Where can this GitHub App be installed?**: Any account

6. **Create GitHub App**

### 2.2 Generate a private key

After creation, scroll to **Private keys** → **Generate a private key**. Download the `.pem` file.

Copy its contents into `.env.local` as a single line with literal `\n`:

```bash
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n...\n-----END RSA PRIVATE KEY-----"
```

The server-side code normalizes the `\n` escapes at signing time.

### 2.3 Copy App ID and slug

- **App ID** (numeric, near the top of the settings page) → `GITHUB_APP_ID`
- **Public link** (e.g. `https://github.com/apps/your-app-name`) → the slug after `/apps/` is `NEXT_PUBLIC_GITHUB_APP_SLUG`

---

## 3. GitHub OAuth App — User sign-in

This is a **separate** GitHub OAuth app used by NextAuth for user login. It is not the same as the GitHub App above.

### 3.1 Create the OAuth app

1. Go to <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name**: `API Sentinel` (or your preferred name)
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/api/auth/callback/github`

3. **Register application**

### 3.2 Copy Client ID and generate a secret

- **Client ID** → `GITHUB_CLIENT_ID`
- **Generate a new client secret** → copy it immediately, you won't see it again → `GITHUB_CLIENT_SECRET`

---

## 4. NextAuth secret

Generate a random 32-byte secret for session encryption:

```bash
openssl rand -base64 32
```

Copy the output to `NEXTAUTH_SECRET`.

On Vercel, `NEXTAUTH_URL` is inferred from the request. For custom domains or local dev on a non-default port, set it explicitly:

```bash
NEXTAUTH_URL=http://localhost:3000   # local
NEXTAUTH_URL=https://your-domain.com # production
```

---

## 5. Google Gemini — Patch generation

1. Go to <https://aistudio.google.com/apikey>
2. **Create API Key** → copy it to `GOOGLE_AI_API_KEY`

Optional: override the model (defaults to `gemini-2.5-flash`, chosen to stay within free-tier quota):

```bash
GOOGLE_AI_MODEL=gemini-2.5-pro
```

---

## 6. Cron secret — Protect the polling endpoint

The daily spec-poll job at `/api/cron/stripe-poll` is protected by a bearer token. Generate one:

```bash
openssl rand -hex 32
```

Copy the output to `CRON_SECRET`.

When you configure Vercel cron (next section), you'll pass this token in the `Authorization: Bearer <CRON_SECRET>` header.

---

## 7. Resend — Email notifications (optional)

If you want to send email notifications when a breaking change is detected:

1. Sign up at <https://resend.com>
2. **API Keys** → **Create API Key** → copy it to `RESEND_API_KEY`
3. Verify a domain in Resend, then set:

```bash
RESEND_FROM_EMAIL=noreply@your-domain.com
```

If these vars are unset, the app still runs; email sends are skipped gracefully.

---

## 8. Deploy to Vercel

### 8.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/api-sentinel.git
git push -u origin main
```

### 8.2 Import to Vercel

1. Go to <https://vercel.com/new>
2. **Import Git Repository** → select your repo
3. **Environment Variables** → paste all the values from `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA..."
GITHUB_WEBHOOK_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
GOOGLE_AI_API_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_GITHUB_APP_SLUG=...
NEXT_PUBLIC_SITE_URL=https://your-domain.com
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```

4. **Deploy**

### 8.3 Cron job

The schedule is already committed in `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/stripe-poll", "schedule": "0 0 * * *" }] }
```

Vercel picks this up automatically on deploy — there is nothing to configure in the dashboard. Because `CRON_SECRET` is set as an environment variable, Vercel sends `Authorization: Bearer <CRON_SECRET>` with each invocation, and the route verifies it with a timing-safe compare. If `CRON_SECRET` is unset the route **refuses to run** rather than exposing an unauthenticated pipeline trigger.

To change the time, edit the `schedule` field in `vercel.json` and redeploy.

### 8.4 Update GitHub App webhook URL

Go back to your GitHub App settings → **Webhook URL** → replace `your-domain.com` with your actual Vercel production URL (e.g. `https://api-sentinel.vercel.app`).

---

## 9. Verification

### 9.1 Check environment

Visit `https://your-domain.com/api/status` in a browser. You should see a JSON report listing all required vars as present. If any are missing, go back and add them in Vercel.

### 9.2 Sign in

Open `https://your-domain.com` → **Sign In** → authenticate with GitHub. If it redirects you back to the landing page with your name in the nav, NextAuth is working.

### 9.3 Connect a repository

Click **Dashboard** → **Connect Repository** → install the GitHub App on one of your repos. You should see it appear in the connected-repos list.

### 9.4 Trigger the cron manually (optional)

If you don't want to wait for the scheduled run, trigger it manually. The route is a `GET`:

```bash
curl https://your-domain.com/api/cron/stripe-poll \
  -H "Authorization: Bearer <your-CRON_SECRET>"
```

Check the Vercel logs to verify it ran without errors.

---

## 10. What happens next

1. **Daily poll**: The cron job fetches the current Stripe OpenAPI spec and diffs it against the last snapshot in the database.
2. **Classification**: Each change is tagged as breaking, deprecation, or additive.
3. **Scan**: For breaking/deprecation changes, the system scans connected repositories for files referencing the changed surface.
4. **Patch generation**: Gemini generates a minimal code patch.
5. **PR creation**: The patch is pushed to a branch and a pull request is opened for your review.

You receive PRs; the system never force-merges. CI runs on the PR as it would for any branch — your own required checks and branch protection rules still gate the merge.

---

## Troubleshooting

**"Webhook signature verification failed"**  
→ Double-check that `GITHUB_WEBHOOK_SECRET` in Vercel matches the secret you set in the GitHub App webhook settings.

**"Supabase RLS policy violation"**  
→ Re-run the migrations. The schema includes RLS policies that allow service-role access.

**"Installation not found"**  
→ The user must install the GitHub App via the `/connect` flow. Direct repo access via OAuth tokens is not supported in this architecture; we use installation tokens scoped per-repo.

**Cron job returns 401**  
→ The `Authorization: Bearer <CRON_SECRET>` header is missing or incorrect. Verify the header in the Vercel cron config.

---

## Security checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never imported in a client component
- [ ] `GITHUB_APP_PRIVATE_KEY` has literal `\n` and is read server-side only
- [ ] `CRON_SECRET` is present and the cron route fails closed without it
- [ ] GitHub webhook signature is verified before the payload is trusted
- [ ] `.env.local` is gitignored and contains no placeholder values

---

You're deployed. When Stripe ships a breaking change, you'll get a PR before your build breaks.
