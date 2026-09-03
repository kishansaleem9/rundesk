-- §G02 frames 020_0124–035_0203 — under a palette answer ClickUp puts copy,
-- thumbs-up, thumbs-down and "Continue with Brain".
--
-- The AI chat already has feedback, but it hangs off a persisted message. A
-- palette answer has no message: it is one shot and is never listed anywhere.
-- Writing every stray search into somebody's chat history just to give the
-- thumbs an id to point at would cost more than the thumbs are worth.
--
-- So the key is the normalised question. That is what is actually being rated
-- — "the answer you give for this" — and it survives the answer being
-- regenerated, which a message id would not.
--
-- No opinion is the ABSENCE of a row, not a third value, so pressing the same
-- thumb again is a DELETE. One row per person per question.
CREATE TABLE IF NOT EXISTS "ai_answer_feedback" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "question"     text NOT NULL,
  "rating"       text NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_answer_feedback"
  ON "ai_answer_feedback" ("workspace_id", "user_id", "question");

CREATE INDEX IF NOT EXISTS "idx_ai_answer_feedback_workspace"
  ON "ai_answer_feedback" ("workspace_id", "created_at");
