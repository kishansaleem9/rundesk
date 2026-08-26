-- §2.8 SyncUp — calls inside the app [19:16-21:15].
--
-- A call is a live thing; a meeting is the record it leaves behind. Separate
-- rows on purpose: `meetings` already carries notes, attendees, action items
-- and a recording URL, so a call that ends should FILL one rather than build a
-- parallel history nobody can search.
CREATE TABLE IF NOT EXISTS "calls" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "channel_id"   uuid REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "started_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title"        text,
  "started_at"   timestamp with time zone DEFAULT now() NOT NULL,
  -- Null while live. The one column that says whether this call is happening.
  "ended_at"     timestamp with time zone,
  -- Recording is off unless someone turns it on, and turning it on announces
  -- itself. Consent is not a preference in two-party jurisdictions, so this
  -- column exists to be SHOWN, not to be quietly true.
  "recording"    boolean DEFAULT false NOT NULL,
  "recording_started_at" timestamp with time zone,
  "meeting_id"   uuid REFERENCES "meetings"("id") ON DELETE SET NULL,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_calls_channel_live" ON "calls" ("channel_id", "ended_at");
CREATE INDEX IF NOT EXISTS "idx_calls_workspace" ON "calls" ("workspace_id", "started_at");

CREATE TABLE IF NOT EXISTS "call_participants" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "call_id"   uuid NOT NULL REFERENCES "calls"("id") ON DELETE CASCADE,
  "user_id"   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at"   timestamp with time zone,
  -- "Was I recorded" is a question someone may ask months later, and
  -- timestamps drift in meaning when recording is stopped and restarted.
  "was_recorded" boolean DEFAULT false NOT NULL,
  CONSTRAINT "uq_call_participants_call_user" UNIQUE ("call_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_call_participants_call" ON "call_participants" ("call_id");
