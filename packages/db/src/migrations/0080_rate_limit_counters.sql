-- Shared rate-limit store so the API's per-IP limits hold across multiple
-- instances (not just per-process). Fixed-window counters keyed by route+ip+window.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket     text PRIMARY KEY,
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_idx ON rate_limit_counters (expires_at);
