-- Presence heartbeat (Plan §6.2). Refreshed while a realtime socket is open;
-- online/away/offline is derived from recency. Additive; null = never seen.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz;
