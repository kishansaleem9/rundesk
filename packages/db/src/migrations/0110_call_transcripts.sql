-- §2.8 gap 10 — AI Notes.
--
-- > "main record karoongi aur yeh aap ke khud hi NOTES bana ke dega aur poori
-- >  ki poori RECORDING bhi karega — poori call hi ki."  [20:42-21:10]
--
-- Two halves, and they are genuinely different things. The RECORDING is a
-- media file, and `meetings.recording_url` already exists to point at one —
-- what was missing was somewhere to keep the key while the call is still
-- running, before there is a meeting to attach it to.
--
-- The TRANSCRIPT is the part the notes are written from, and it is stored a
-- line at a time rather than as one blob because it is produced live, by
-- several people at once, and a call that crashes halfway should still leave
-- the half it heard.
--
-- One row per utterance, attributed. Attribution is the whole reason this is a
-- table and not a text column: "Hamda said she would send the deck" is a
-- useful note and "somebody said they would send the deck" is not. Each
-- participant's own browser transcribes their own microphone, so the speaker
-- is known for free rather than guessed from a mixed audio track.

CREATE TABLE IF NOT EXISTS "call_transcript_lines" (
  "id"      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" uuid NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "text"    text NOT NULL,
  "said_at" timestamptz NOT NULL DEFAULT now()
);

-- The only way this is ever read: everything for one call, in the order it was
-- said.
CREATE INDEX IF NOT EXISTS "call_transcript_lines_call_idx"
  ON "call_transcript_lines" ("call_id", "said_at");

-- Where the recording lives while the call is still running. Nullable and
-- separate from meetings.recording_url: the meeting record does not exist
-- until the call ends, and an upload that finished before then must not be
-- homeless.
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "recording_storage_key" text;
