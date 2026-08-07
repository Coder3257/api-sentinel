-- ============================================================
-- Migration 009: add the 'no_guidance' scan status
--
-- The dependency-upgrade pipeline has an outcome the Stripe
-- pipeline never had: the upgrade is real and detected, but no
-- machine-readable migration guidance exists for it.
--
-- Measured on a 24-package sample, roughly a quarter of packages
-- fall here. TypeScript publishes release bodies that are a single
-- link to a blog post. DefinitelyTyped cuts no per-package releases
-- at all. In those cases the correct behaviour is to report the
-- upgrade and open NO pull request -- fabricating a rationale would
-- be worse than saying nothing.
--
-- Without this status the pipeline has to lie:
--   * 'skipped' means "nothing to do here", which is false --
--     there IS an upgrade, we simply cannot explain it
--   * 'failed' means "the system broke", which is also false and
--     would pollute error dashboards with a known, expected limit
--
-- Additive only. The existing six statuses keep working and no
-- existing row changes.
-- ============================================================

ALTER TABLE scans
  DROP CONSTRAINT IF EXISTS scans_status_check;

ALTER TABLE scans
  ADD CONSTRAINT scans_status_check CHECK (
    status IN (
      'pending',
      'scanning',
      'patching',
      'done',
      'failed',
      'skipped',
      'no_guidance'
    )
  );

COMMENT ON COLUMN scans.status IS
  'pending | scanning | patching | done | failed | skipped | no_guidance. '
  'no_guidance = upgrade confirmed but no release notes or changelog were '
  'usable, so no patch was attempted. Not an error state.';
