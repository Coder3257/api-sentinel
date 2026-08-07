# API Sentinel — Fix Brief for Builder Agent

**Read this whole file before writing any code.**

You are the coordinating agent. You will delegate mechanical work to the Gemini
builder agent in Antigravity. This document tells you what is broken, what order
to fix it in, and what "done" means for each item.

---

## 0. Hard rules — violating these is worse than not doing the task

1. **Never fabricate a passing result.** This codebase has already been burned
   twice: an agent wrote `"build": "echo build success"` into package.json files
   so verification would pass, and a `injectDummyBuild()` helper existed purely
   to make the pipeline look green. Both were removed. If something cannot be
   verified, the correct output is "unverified" — not a fake pass.

2. **Never mark a task complete without running it against real data.** Four
   real bugs in this repo were invisible on inspection and only appeared when
   scripts ran against the live npm registry and GitHub API:
   - semver parser silently dropped 5 of 16 dependencies as "up to date"
   - an upsert returned pre-existing rows as new, which would have re-sent
     notifications daily for the same upgrade
   - the release-note budget kept minor releases and dropped the one major
     release that documented breaking changes
   - build verification passed because it was echoing success

   Inspection would have caught none of them. Run the script. Read the output.

3. **Do not claim a feature exists in docs until the code exists.** See task 1.

4. **Additive schema changes only.** The Stripe path is in production. Do not
   drop columns or change existing constraints.

5. **When a task is ambiguous, stop and ask.** Do not guess at product
   direction. Several items below are explicitly flagged as decisions, not
   tasks.

---

## 1. [P0] Run the coverage measurement — this gates everything else

**Do this first. Do not start task 3 or later until the number is known.**

```bash
npx tsx --env-file=.env.local scripts/measure-notes-coverage.ts
```

The script already exists and is complete. It samples 24 npm packages across
runtime libraries, frameworks, SDKs, tooling, and type definitions, and reports
what fraction have machine-readable breaking-change notes.

**Set `GITHUB_TOKEN` in `.env.local` first** (a classic PAT, no scopes needed).
The script makes roughly 44 GitHub API calls; the unauthenticated limit is 60/hr
and you will be rate-limited without it.

**Why this gates everything:** of the three real upgrade candidates found in this
repo, two returned no usable notes. TypeScript publishes release bodies that are
a single link to a blog post. DefinitelyTyped cuts no per-package releases at
all. If that ratio holds across the ecosystem, the AI cannot explain most
upgrades it detects, and the product silently becomes "we tell you an upgrade
exists" — which is what Dependabot already does for free.

**Report the number back before proceeding.** Then:

- **≥75%** — the patch generator is the core product. Proceed to task 3.
- **50–74%** — proceed, but task 3 must degrade gracefully: report the upgrade
  confidently, patch only where notes exist, and never fabricate a rationale.
- **<50%** — **stop and escalate.** The AI-patch-first positioning overpromises.
  The alternative is deriving breaking changes from the code itself: install the
  new version, read the compiler and type errors, work backward. Harder to
  build, far more defensible, works on undocumented packages. That is a product
  decision, not an implementation detail.

---

## 2. [P0] Correct the handoff document

`HANDOFF.md` section 3, step 6 currently reads:

> **Verify Patch**: Compiles code changes and analyzes AST to ensure no syntax
> issues.

**This step does not exist.** The entire verification pipeline was removed
because Vercel's Hobby tier caps functions at 60 seconds and a real
clone-install-test cycle takes 90–150s. `lib/pipeline/run-pipeline.ts` no longer
clones, installs, or tests anything.

**Fix:** replace step 6 with an accurate description. Something like:

> **Verification (not performed in-pipeline)**: Patches are opened as draft PRs
> without automated verification. The PR body states whether the target repo has
> CI workflows that will check the change. Rebuilding verification requires a
> job queue or a paid Vercel tier — see Known Unresolved Items.

Also move this into section 7 as an open item with the 60s constraint noted.

**Why this is P0 and not cosmetic:** a technical diligence partner will diff the
document against the code and find this within twenty minutes. Once one claim is
overstated, every other claim in the document becomes suspect. "We open draft
PRs and rely on your CI" is a perfectly defensible position. Claiming
verification that was deleted is not.

While you are in there, verify every other claim in sections 3 and 5 against the
actual files. Section 5 lists `/api/cron/dependency-patch` as "executes pending
dependency scans" — confirm that route exists and does what the line says. If it
does not exist, remove the line. If it exists but is a stub, say so.

---

## 3. [P1] Build the generic patch generator — the pipeline currently dead-ends

**This is the largest piece of real work. Do not hand the whole thing to the
Gemini agent as one task; decompose it.**

### Current state

`lib/pipeline/run-dependency-scan.ts` creates rows in `scans` with
`upgrade_candidate_id` set and `status = 'pending'`. **Nothing consumes them.**
`lib/pipeline/run-pipeline.ts` only processes scans triggered by a Stripe
changelog entry. The daily cron will accumulate pending scans indefinitely.

Three upgrade candidates are already sitting in the database in this state:
`@types/node` 20→26, `eslint` 9→10, `typescript` 5→7.

### What to build

A path that mirrors `processRepoForEntry()` in `run-pipeline.ts` but is driven
by an upgrade candidate instead of a changelog entry:

1. Load scans where `upgrade_candidate_id IS NOT NULL AND status = 'pending'`
2. Join through to `upgrade_candidates` → `repo_dependencies` to get the
   package name and version range
3. Call `fetchReleaseNotes(packageName, fromVersion, toVersion)` — this is
   already built and tested in `lib/registry/release-notes.ts`
4. **If notes are null, do not generate a patch.** Mark the scan with a status
   that means "upgrade detected, no migration guidance available" and stop.
   This is the honest path and it must exist before the happy path.
5. Find the files in the repo that import the package — see task 4
6. Prompt Gemini with the release notes plus the affected files
7. Open a draft PR via the existing `lib/github/pr-opener.ts`

### Acceptance criteria

- Running against the `eslint` 9→10 candidate produces a PR whose diff is
  plausibly correct and whose body cites the actual breaking changes from the
  10.0.0 release notes
- Running against the `typescript` 5→7 candidate produces **no PR** and a scan
  status indicating notes were unavailable
- Re-running produces no duplicate PRs

### Ordering note

Build step 4 (the null path) before step 6 (the Gemini path). The failure mode
must work before the success mode, or you will not notice when it silently
doesn't.

---

## 4. [P1] Generic import scanner

`lib/github/repo-scanner.ts` finds files importing `stripe`. The patch generator
needs "find files importing package X" for arbitrary X.

Either generalize the existing function or add a sibling. Must handle:

- `import x from "pkg"` and `import { a } from "pkg"`
- `require("pkg")`
- subpath imports: `import x from "pkg/sub"` should match package `pkg`
- scoped packages: `@scope/pkg`
- must NOT match a package whose name is a prefix of another
  (`react` must not match `react-dom`)

Write a test script with real fixtures covering every case above, including the
prefix case. That last one is the bug this will actually have.

---

## 5. [P1] Filter `@types/*` at detection time

`lib/dependency/upgrade-detector.ts` currently emits upgrade candidates for
`@types/*` packages. These are type definitions published by DefinitelyTyped,
which cuts no per-package GitHub releases, so `fetchReleaseNotes` can never
return anything for them. Every one is a candidate that burns registry calls and
database rows and can never produce a patch.

Skip them at detection, with a comment explaining why. If you later build the
compiler-error-based path from task 1, revisit — type packages are exactly where
that approach works and prose does not.

---

## 6. [P1] Dashboard copy for upgrade scans

`app/dashboard/page.tsx` renders scans generically (repo name, scan ID, status),
so upgrade-triggered scans will not crash. But they will be indistinguishable
from Stripe scans, which is confusing once both exist.

Add copy that reflects the trigger: for upgrade scans show the package and
version jump (`eslint 9.0.0 → 10.8.0`); for Stripe scans keep the current
changelog reference. The scan row already carries both nullable FKs — join
whichever is set.

Also handle the "notes unavailable" status from task 3 with honest copy:
something like "Upgrade available — no migration guide found", not an error
state. It is not an error; it is a known limit.

---

## 7. [P2] Delete or wire up `lib/dashboard/queries.ts`

Nothing imports this file. It contains a full parallel implementation of the
dashboard queries, including a `getRecentScans()` that joins `stripe_changelogs`
and would break on upgrade scans, plus `getPrStats()` with no `user_id` filter
(a data leak if it were ever wired up).

The live dashboard is `app/dashboard/page.tsx`. Either delete `queries.ts` or
finish it and switch the page to use it. Do not leave a dead second
implementation with a latent leak in it.

---

## 8. [P2] Apply migration 008

`supabase/migrations/008_notification_preferences.sql` is pending manual
execution in the Supabase SQL Editor. Apply it, then load the dashboard and
confirm nothing regressed. Migration 007 is already applied and verified.

---

## 9. [P2] Raise the manifest cap

`MAX_MANIFESTS_PER_REPO = 25` in `lib/github/dependency-reader.ts`. A real
enterprise monorepo has hundreds of `package.json` files — and those are exactly
the organizations with the most upgrade debt and the most budget.

Current behavior is correct-but-limited: it truncates and flags
`truncated: true`. Raise the cap substantially and batch the reads, or switch to
the git tree blob API to fetch contents in bulk. Keep a cap — just not one that
excludes your best future customers.

---

## 10. [P2] Automated tests

There is no test suite. Everything is manual scripts a human runs and eyeballs.
For a product that writes code into other people's repositories, that is the
diligence finding that ends a technical conversation.

Start with unit tests for the pure functions, where bugs have already been found:

- `parseDeclaredVersion()` — `^20`, `~5`, `>=1.2 <2`, `18 || 19`,
  `workspace:*`, `file:../x`, git URLs
- `hasUsableContent()` — real TypeScript link-only body, real eslint breaking-
  changes body
- `dedupeDependencies()` — monorepo with conflicting ranges
- the import matcher from task 4, including the `react` / `react-dom` prefix case

Use whatever runner is simplest to add. The point is that these run in CI, not
that the framework is fashionable.

---

## 11. [P2] Disconnect this repo from its own dashboard

`Coder3257/api-sentinel` is connected and being scanned daily. The cron will open
upgrade PRs against the product's own repository. Disconnect it, or exclude it.

---

## 12. [DECISION — do not implement without discussion]

### The migration corpus

Currently, when a customer needs `express 4→5`, the system fetches release notes
and prompts Gemini for that repo. When the next customer needs `express 4→5`, it
does all of it again.

The express 4→5 migration is the same migration for every customer on earth. The
call sites differ; the transformation rules do not.

The proposal is a corpus keyed on `(package, from_version, to_version)` —
exactly the shape `upgrade_candidates` already has — holding verified
transformation rules derived once, tested against real repos, and corrected when
a customer edits a generated PR before merging.

Three consequences: cost stops scaling with customer count, accuracy compounds
with every correction, and the result is an asset that is hard to copy — a
verified migration knowledge base with real merge statistics behind it. Detection
is a `package.json` parse and a registry call; anyone can build that. The corpus
is the part that is not trivially copied.

**This is an architecture decision with business-model implications. Bring a
proposal; do not start building it unprompted.**

---

## Suggested delegation to the Gemini builder agent

Mechanical, single-file, clear acceptance criteria — safe to delegate:
tasks 2, 5, 6, 7, 8, 11, and the test-writing in 10.

Multi-file, touches the pipeline or the database write path — keep for the
stronger model: tasks 3, 4, 9.

Task 1 is a script run, not a code change. Do it yourself, first.

For every delegated task, give the Gemini agent the hard rules from section 0
verbatim. The failure mode you are guarding against is not bad code — it is
plausible-looking code that reports success without having done the work.

---

## Definition of done for this whole brief

- Coverage number known and reported
- `HANDOFF.md` contains no claim that is not true of the code
- The `eslint` 9→10 candidate produces a real draft PR citing real breaking changes
- The `typescript` 5→7 candidate produces no PR and an honest status
- No `@types/*` candidates in the database
- Tests run in CI
- A written answer to: "why would someone use this instead of Dependabot?"

That last one is not a code task, but it is the one that decides whether any of
the rest matters.
