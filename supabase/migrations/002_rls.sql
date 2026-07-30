-- ============================================================
-- API Sentinel — Enable RLS on all tables
-- No policies defined: deny-all for anon/authenticated roles.
-- Service role bypasses RLS by design (used server-side only).
-- ============================================================

ALTER TABLE repos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_changelogs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_requests       ENABLE ROW LEVEL SECURITY;
