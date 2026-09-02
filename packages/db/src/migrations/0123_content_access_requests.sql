-- §G10 [12:16-12:20] — "someone asked for access to something".
--
-- The notification kind has existed since the enum was written and was only
-- ever emitted for FEATURE requests. A person who hit a doc, list or space they
-- could not see had no way to ask its owner for it at all.
--
-- Shaped after feature_flag_requests: this table exists to answer one question
-- — "has this person asked for this object lately" — so that pressing a button
-- twice is one request rather than a drum roll on somebody's bell.
CREATE TABLE IF NOT EXISTS "content_access_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "object_type"  text NOT NULL,
  "object_id"    uuid NOT NULL,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "content_access_requests_recent_idx"
  ON "content_access_requests" ("workspace_id", "object_type", "object_id", "requester_id", "created_at");
