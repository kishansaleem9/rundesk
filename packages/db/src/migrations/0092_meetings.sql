-- Meetings as a record, not a link.
--
-- A meeting could already be *started* from a task — the join URL was stored as
-- a task_external_links row — but nothing was kept afterwards. There was no
-- meeting to come back to, no attendee list, and no home for the notes the AI
-- was already able to read. The extract-action-items loop ran and forgot.
--
-- Notes and transcript are plain text on the row rather than a doc: they are
-- written once by a notetaker and read as a whole, and a doc would need its own
-- permission story to say what a meeting already says through its attendees.

CREATE TABLE IF NOT EXISTS "meetings" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title"         text NOT NULL,
  "starts_at"     timestamp with time zone,
  "ends_at"       timestamp with time zone,
  -- 'zoom' | 'google_meet' | 'manual' — a meeting that happened elsewhere and
  -- was written up here is still a meeting.
  "provider"      text NOT NULL DEFAULT 'manual',
  "join_url"      text,
  "recording_url" text,
  "notes"         text,
  "transcript"    text,
  -- The task this was started from, when it was. SET NULL so deleting the task
  -- does not delete the record of the conversation.
  "task_id"       uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meetings_workspace_idx" ON "meetings" ("workspace_id");
-- The meetings list is "most recent first", which without this is a sort over
-- every meeting the workspace has ever held.
CREATE INDEX IF NOT EXISTS "meetings_workspace_start_idx"
  ON "meetings" ("workspace_id", "starts_at" DESC);
CREATE INDEX IF NOT EXISTS "meetings_task_idx" ON "meetings" ("task_id");

CREATE TABLE IF NOT EXISTS "meeting_attendees" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  -- A workspace member, or an outsider who only has a name and an email.
  "user_id"    uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "email"      text,
  "name"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meeting_attendees_meeting_idx" ON "meeting_attendees" ("meeting_id");
-- One row per person per meeting. Partial, because the outsider half of the
-- table has no user_id to be unique on.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_meeting_attendee_user"
  ON "meeting_attendees" ("meeting_id", "user_id") WHERE "user_id" IS NOT NULL;
