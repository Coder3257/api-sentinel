-- ============================================================
-- Migration 011: store the Lemon Squeezy subscription id on repos
--
-- The webhook currently resolves which repo to update from
-- meta.custom_data.repo_id, which is only present on events that
-- originate from a checkout we created. Lemon Squeezy does NOT echo
-- custom data on events it generates itself:
--
--   * subscription_expired raised by failed dunning
--   * subscription_cancelled done from the LS admin panel
--   * subscription_updated on plan/renewal changes
--
-- Those arrive with empty custom_data, the webhook finds no repo_id,
-- returns 200, and the repo stays 'pro' forever with nobody paying.
--
-- Persisting the subscription id on subscription_created gives every
-- later event a durable lookup key. custom_data stays as the fallback
-- for the very first event, before any id has been stored.
--
-- Idempotent: safe to re-run, per the contract in DEPLOY.md.
-- ============================================================

ALTER TABLE repos
  ADD COLUMN IF NOT EXISTS lemonsqueezy_subscription_id TEXT;

-- The webhook looks up by this on every non-checkout event, so it needs
-- an index. Partial: only a minority of repos are ever subscribed.
CREATE INDEX IF NOT EXISTS repos_lemonsqueezy_subscription_id_idx
  ON repos (lemonsqueezy_subscription_id)
  WHERE lemonsqueezy_subscription_id IS NOT NULL;

COMMENT ON COLUMN repos.lemonsqueezy_subscription_id IS
  'Lemon Squeezy subscription id (data.id on subscription_* webhooks). '
  'Set on subscription_created from checkout custom_data, then used as '
  'the lookup key for later events that carry no custom_data.';
