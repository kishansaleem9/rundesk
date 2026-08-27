-- §G06 [06:42–07:39] — four things the settings menu she walked could do.
--
-- Grouped because they are one menu: what you are doing, whether you want to
-- be interrupted, how the app should look, and how to reach a person.

-- ---------------------------------------------------------------------------
-- 1. A status in your own words  [06:42]
-- ---------------------------------------------------------------------------
-- "SET STATUS ka matlab yeh hota hai ke main BREAK pe jaa rahi hoon… mere team
-- member ko nahi pata… to main yahan se apna status set kar sakti hoon ke main
-- is time kya kar rahi hoon."
--
-- `presence_status` is the availability half and cannot carry this: "away"
-- does not say it is a thirty-minute break, and nothing about it expires, so a
-- stale "Busy" outlives its reason by days. An emoji, a sentence, and a moment
-- it stops being true.
--
-- Expiry is enforced on read rather than by a sweeper. A job that clears
-- statuses is a job that can be down, and a status outliving its reason is
-- precisely what the column exists to prevent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_emoji" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_text" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status_expires_at" timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Muted until a moment  [06:53]
-- ---------------------------------------------------------------------------
-- The row in the frames carries a "›" — mute FOR a length of time. Ours was a
-- switch that stayed flipped until somebody remembered to flip it back, so
-- muting for one meeting muted you for days.
--
-- Null means no timed mute. The scheduled quiet hours already in
-- notification_preferences are a different thing and still apply.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dnd_until" timestamptz;

-- ---------------------------------------------------------------------------
-- 3. High contrast  [07:03]
-- ---------------------------------------------------------------------------
-- Nothing existed at any layer — a case-insensitive grep for "contrast" across
-- apps/ returned nothing. Nullable like `theme`: null means never chosen, so
-- the default can move without overwriting anybody's answer.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "high_contrast" boolean;

-- ---------------------------------------------------------------------------
-- 4. Help can book a call  [07:30]
-- ---------------------------------------------------------------------------
-- "ya phir main ClickUp ki team se DIRECT COMMUNICATION bhi kar sakti hoon,
-- kyunke main MEETING SCHEDULE bhi start kar sakti hoon."
--
-- Two of the three routes existed: read the docs, or open a ticket. The third
-- went to a mailto:. This makes it a ticket with a kind, so the request lands
-- in the queue the team already works and inherits the SLA columns already on
-- this table. A scheduler of our own would need availability we do not model,
-- and slots nobody published are a booking that cannot be kept.
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'question';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "requested_slots" jsonb;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamptz;
