-- ============================================================
-- Migration 007: Dependency-upgrade scanning schema
--
-- Adds two new tables alongside the existing stripe_changelogs:
--   * repo_dependencies    -- a repo's declared deps at scan time
--   * upgrade_candidates   -- one actionable major-version jump per dep
--
-- The existing `scans` table is kept backward-compatible:
--   * changelog_id          stays but is made nullable
--   * upgrade_candidate_id  is added (nullable FK to upgrade_candidates)
--   * A CHECK ensures exactly one of the two trigger FKs is non-null
--
-- All existing rows are unchanged. The Stripe pipeline keeps working
-- without any code changes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. repo_dependencies
--    Snapshot of a repo declared dependencies at the time
--    we inspected it. One row per (repo, ecosystem, package).
--    resolved_version is what is actually installed;
--    declared_range is what package.json / pyproject.toml etc. states.
-- ------------------------------------------------------------
CREATE TABLE repo_dependencies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id          UUID        NOT NULL REFERENCES repos (id) ON DELETE CASCADE,
  ecosystem        TEXT        NOT NULL
                               CHECK (ecosystem IN (
                                 'npm', 'pypi', 'go', 'maven', 'rubygems', 'nuget'
                               )),
  package_name     TEXT        NOT NULL,
  declared_range   TEXT,
  resolved_version TEXT,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (repo_id, ecosystem, package_name)
);

CREATE INDEX repo_deps_repo_id_idx      ON repo_dependencies (repo_id);
CREATE INDEX repo_deps_package_name_idx ON repo_dependencies (package_name);

ALTER TABLE repo_dependencies ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. upgrade_candidates
--    One row per (repo_dependency, target version) that the
--    system has identified as an actionable major upgrade.
-- ------------------------------------------------------------
CREATE TABLE upgrade_candidates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dependency_id       UUID        NOT NULL REFERENCES repo_dependencies (id) ON DELETE CASCADE,
  from_version        TEXT        NOT NULL,
  to_version          TEXT        NOT NULL,
  breaking_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  breaking_source_url TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dependency_id, to_version)
);

CREATE INDEX upgrade_candidates_dep_id_idx ON upgrade_candidates (dependency_id);

ALTER TABLE upgrade_candidates ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Alter scans to support both trigger types
--
--    Before: changelog_id  UUID NOT NULL REFERENCES stripe_changelogs
--    After:  changelog_id  UUID     NULL REFERENCES stripe_changelogs
--            upgrade_candidate_id UUID NULL REFERENCES upgrade_candidates
--            CHECK: exactly one is non-null
--
--    All existing rows have changelog_id set, so the constraint
--    is satisfied automatically once the column becomes nullable.
-- ------------------------------------------------------------

ALTER TABLE scans
  ALTER COLUMN changelog_id DROP NOT NULL;

ALTER TABLE scans
  ADD COLUMN upgrade_candidate_id UUID
    REFERENCES upgrade_candidates (id) ON DELETE RESTRICT;

ALTER TABLE scans
  ADD CONSTRAINT scans_single_trigger_source CHECK (
    (changelog_id IS NOT NULL)::int +
    (upgrade_candidate_id IS NOT NULL)::int = 1
  );

CREATE UNIQUE INDEX scans_repo_upgrade_candidate_unique
  ON scans (repo_id, upgrade_candidate_id)
  WHERE upgrade_candidate_id IS NOT NULL;

CREATE INDEX scans_upgrade_candidate_id_idx ON scans (upgrade_candidate_id);
