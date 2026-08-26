-- §2.8 — two things a call needs the database to guarantee.
--
-- 1. ONE LIVE CALL PER CHANNEL.
--
-- start() read "is one already running here" and then inserted, which is two
-- statements: two people pressing Start SyncUp in the same moment both saw
-- nothing running and both created a call. The channel then had two cards, two
-- notification storms, and a Join button that dropped you into whichever one
-- the live lookup happened to return.
--
-- The code already promised this ("two people pressing the button at the same
-- moment must land in the SAME call — starting two and letting them wonder why
-- they cannot see each other is the obvious failure and the hardest one to
-- report"). Only the database can actually keep that promise.
--
-- Existing duplicates are closed first, oldest kept, or the index cannot be
-- built on a deployment that has already hit this.
UPDATE calls c
   SET ended_at = now()
 WHERE c.ended_at IS NULL
   AND c.channel_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM calls older
      WHERE older.channel_id = c.channel_id
        AND older.ended_at IS NULL
        AND (older.started_at, older.id) < (c.started_at, c.id)
   );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_calls_one_live_per_channel"
  ON "calls" ("channel_id")
  WHERE "ended_at" IS NULL AND "channel_id" IS NOT NULL;

-- 2. A RECORDING CAN HAVE MORE THAN ONE PIECE.
--
-- Recording is a toggle, so a call can be recorded, stopped for a private
-- aside, and recorded again. Each stop produces its own file, and a single
-- `recording_storage_key` on the call meant the second upload overwrote the
-- first — the earlier audio stayed in storage with nothing pointing at it and
-- nobody aware it existed.
--
-- Rows here are append-only. `position` orders them for playback; it is not
-- assumed contiguous, because a failed upload leaves a gap and inventing one
-- would misrepresent what was captured.
CREATE TABLE IF NOT EXISTS "call_recordings" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id"     uuid NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL,
  "position"    integer NOT NULL DEFAULT 0,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

-- The only way this is read: every piece of one call, in order.
CREATE INDEX IF NOT EXISTS "call_recordings_call_idx"
  ON "call_recordings" ("call_id", "position");

-- Handing the same key in twice is a retry, not a second segment.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_call_recordings_key"
  ON "call_recordings" ("call_id", "storage_key");

-- Whatever single key a call already carries becomes its first segment, so
-- nothing recorded before this migration is lost.
INSERT INTO "call_recordings" ("call_id", "storage_key", "position")
SELECT id, recording_storage_key, 0
  FROM calls
 WHERE recording_storage_key IS NOT NULL
ON CONFLICT DO NOTHING;
