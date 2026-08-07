-- ============================================================
-- Migration 010: add the plan column to repos
--
-- 'free'  = Stripe changelog detection and patching (the original product)
-- 'pro'   = adds AI patching for any npm dependency upgrade
--
-- Enforced in lib/pipeline/run-dependency-scan-pipeline.ts, which skips
-- any scan whose repo is not explicitly 'pro'.
--
-- NOT NULL DEFAULT 'free' backfills every existing row, so no repo is
-- left with a NULL plan for the gate to interpret.
-- ============================================================

ALTER TABLE repos
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Added separately so re-running the migration does not fail on a
-- duplicate constraint (ADD CONSTRAINT has no IF NOT EXISTS).
ALTER TABLE repos
  DROP CONSTRAINT IF EXISTS repos_plan_check;

ALTER TABLE repos
  ADD CONSTRAINT repos_plan_check CHECK (plan IN ('free', 'pro'));

COMMENT ON COLUMN repos.plan IS
  'free | pro. pro unlocks AI patching for non-Stripe dependency upgrades. '
  'Set by the Lemon Squeezy webhook; anything other than pro is unentitled.';
