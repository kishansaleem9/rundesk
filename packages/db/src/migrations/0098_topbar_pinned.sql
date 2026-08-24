-- §6 [07:51] — "main yahan koi bhi tool PIN kar sakti hoon."
--
-- `topbar_hidden` is opt-out: absence means shown. Fine for five controls we
-- picked; wrong once the catalogue holds the tools she named, because each new
-- one would appear in every existing member's bar unasked.
--
-- Nullable on purpose. NULL means "has never chosen" and is migrated on read
-- from topbar_hidden, so nobody's top bar changes under them. An empty array
-- means "pinned nothing", which is a choice and is kept.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "topbar_pinned" jsonb;
