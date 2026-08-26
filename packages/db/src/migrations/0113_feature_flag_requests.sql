-- §2.2 — "somebody asked for this feature", recorded once per press.
--
-- requestFlag's once-a-day rule read the `notifications` table: an
-- access_requested row from this requester for this flag inside 24h meant the
-- press was a repeat. But that row is only written for an admin who has an
-- in-app channel switched on. A workspace whose admins run email-only produced
-- no row at all, so the rule had nothing to find and never tripped — the same
-- press mailed every admin again on every reload, which is exactly the harm
-- the code claimed to have fixed.
--
-- The ask is its own fact and does not depend on how anybody chose to be told
-- about it, so it stops being inferred from somebody else's notification.
CREATE TABLE IF NOT EXISTS "feature_flag_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "flag_key"     text NOT NULL,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

-- The only way this is read: "has this person asked for this flag lately".
CREATE INDEX IF NOT EXISTS "feature_flag_requests_recent_idx"
  ON "feature_flag_requests" ("workspace_id", "flag_key", "requester_id", "created_at");

-- Carry across what the notifications table already knows, so an ask made in
-- the last day is not repeated the moment this ships. Only in-app asks were
-- ever recorded there — the email-only ones are the rows that never existed —
-- but keeping the ones that do exist is strictly better than dropping them.
INSERT INTO "feature_flag_requests" ("workspace_id", "flag_key", "requester_id", "created_at")
SELECT DISTINCT ON (n.workspace_id, n.target ->> 'entityId', n.actor_id)
       n.workspace_id, n.target ->> 'entityId', n.actor_id, n.created_at
  FROM notifications n
 WHERE n.type = 'access_requested'
   AND n.workspace_id IS NOT NULL
   AND n.actor_id IS NOT NULL
   AND n.target ->> 'entityId' IS NOT NULL
   AND n.created_at > now() - interval '1 day'
 ORDER BY n.workspace_id, n.target ->> 'entityId', n.actor_id, n.created_at DESC;
