-- ============================================================
-- Migration 008: notification preferences
--
-- One row per (user, repo). repo_id NULL is the user-level default
-- applied to any repo without its own row.
--
-- Idempotent: safe to re-run, per the contract in DEPLOY.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_prefs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  repo_id         UUID        NULL REFERENCES repos (id) ON DELETE CASCADE,
  email_enabled   BOOLEAN     NOT NULL DEFAULT true,
  webhook_url     TEXT        NULL,
  webhook_enabled BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, repo_id)
);

-- No-op when already enabled, so this is safe on a re-run.
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
