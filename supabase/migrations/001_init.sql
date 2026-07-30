-- ============================================================
-- API Sentinel — Initial Schema
-- ============================================================

-- ------------------------------------------------------------
-- 1. repos
--    One row per customer repo installed via the GitHub App.
-- ------------------------------------------------------------
CREATE TABLE repos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  github_repo_id   BIGINT      UNIQUE NOT NULL,       -- GitHub's immutable repo ID
  owner            TEXT        NOT NULL,               -- e.g. "acme-corp"
  name             TEXT        NOT NULL,               -- e.g. "payments-service"
  installation_id  BIGINT      NOT NULL,               -- GitHub App installation ID
  default_branch   TEXT        NOT NULL DEFAULT 'main',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX repos_installation_id_idx ON repos (installation_id);

-- ------------------------------------------------------------
-- 2. stripe_changelogs
--    One row per Stripe OpenAPI spec version we've seen.
--    entry_id = the Git SHA of the openapi tag/commit we diffed.
-- ------------------------------------------------------------
CREATE TABLE stripe_changelogs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      TEXT        UNIQUE NOT NULL,    -- e.g. "v123" tag or commit SHA
  title         TEXT        NOT NULL,           -- human-readable label
  published_at  TIMESTAMPTZ NOT NULL,
  severity      TEXT        NOT NULL CHECK (severity IN ('breaking', 'deprecation', 'additive')),
  raw_diff      TEXT        NOT NULL,           -- raw OpenAPI JSON diff
  summary       TEXT,                           -- AI-generated plain-English summary (filled later)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stripe_changelogs_published_at_idx ON stripe_changelogs (published_at DESC);

-- ------------------------------------------------------------
-- 3. scans
--    One row per (repo × changelog entry) analysis run.
-- ------------------------------------------------------------
CREATE TABLE scans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         UUID        NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
  changelog_id    UUID        NOT NULL REFERENCES stripe_changelogs (id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'scanning', 'patching', 'done', 'failed', 'skipped')),
  affected_files  JSONB,      -- [{path: string, reason: string}]
  patch_result    JSONB,      -- [{filePath, patchedContent, reasoning}] — set by AI step
  error           TEXT,       -- last error message if status = 'failed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (repo_id, changelog_id)   -- prevent duplicate scans
);

CREATE INDEX scans_repo_id_idx      ON scans (repo_id);
CREATE INDEX scans_changelog_id_idx ON scans (changelog_id);
CREATE INDEX scans_status_idx       ON scans (status);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER scans_updated_at
  BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ------------------------------------------------------------
-- 4. pull_requests
--    One row per PR opened by the system.
-- ------------------------------------------------------------
CREATE TABLE pull_requests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id        UUID        NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  github_pr_id   BIGINT      UNIQUE,            -- set once GitHub confirms creation
  pr_url         TEXT,
  branch_name    TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'merged', 'closed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pull_requests_scan_id_idx ON pull_requests (scan_id);
