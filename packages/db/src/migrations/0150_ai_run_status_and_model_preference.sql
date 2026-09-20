-- §V2-S18 `[17:16]`–`[17:32]` and §V2-11 frame `19:05`.
--
-- Two things the AI surface could not do, both for the same reason: nothing
-- was written down.
--
-- 1. THE ACTIVITY LOG HAD NO STATUS. `recordUsage` fired on the success path
--    and nowhere else, so every row in `ai_usage` was a success. A "Status"
--    filter over that is a dropdown with one reachable value — it demos
--    perfectly and can never say anything. The column is only half of it; the
--    other half is the write on the failure path, in ai.service.ts.
--
-- 2. THE PREFERRED MODEL WAS A BROWSER HABIT. It lived in localStorage
--    (`rundesk.aiTier`), so "set your preferred AI" did not survive a second
--    machine, a second browser, or a private window.

-- ── 1. status on a run ──────────────────────────────────────────────────────
-- DEFAULT 'succeeded' is a statement about history, not a convenience: every
-- row that existed before this migration was written by the success path, so
-- backfilling them as succeeded is the truth rather than a guess.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded';

-- Short machine token: 'not_configured' | 'rate_limited' | 'provider_error'.
-- The rate limiter reads it, because a run the limiter itself refused must not
-- count towards the limit that refused it.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS error_code text;

-- The sentence a person is shown beside the row. Truncated by the writer.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS error_message text;

-- Two values and nothing else. Without this a typo in one writer produces a
-- third status that every reader silently drops, and the count goes quietly
-- wrong instead of loudly.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_status_check') THEN
    ALTER TABLE ai_usage
      ADD CONSTRAINT ai_usage_status_check CHECK (status IN ('succeeded', 'failed'));
  END IF;
END $$;

-- The activity log's read is "this workspace, this status, newest first".
CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_status
  ON ai_usage (workspace_id, status, created_at);

-- ── 2. the preferred model, per person per workspace ────────────────────────
-- The TIER is stored, not the model name: which model a tier resolves to is
-- ours to change, and a preference pinned to a model id stops resolving the day
-- that id moves.
CREATE TABLE IF NOT EXISTS ai_model_preferences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  preferred_tier text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Per workspace, so the cheap tier in a busy shared space and the deep one
-- where you think are both expressible. Unique, so the write is an upsert
-- rather than a read-then-write with a race in the middle.
CREATE UNIQUE INDEX IF NOT EXISTS ai_model_preferences_user_workspace
  ON ai_model_preferences (user_id, workspace_id);
