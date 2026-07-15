-- User-created task reminders (Plan §4/§10). A background tick fires each due
-- reminder once (notified_at stamped) via the notification pipeline. Additive.
CREATE TABLE IF NOT EXISTS "reminders" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "task_id"      uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "note"         text,
  "remind_at"    timestamptz NOT NULL,
  "notified_at"  timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reminders_due_idx" ON "reminders" ("remind_at");
CREATE INDEX IF NOT EXISTS "reminders_user_idx" ON "reminders" ("user_id");
