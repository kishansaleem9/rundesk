-- §V2-14 — more than one calendar account, and they belong to a PERSON.
--
-- `[13:32]`–`[13:38]` "'Manage Account' pe click karoongi … 'Add Account' …
-- aur jitna chahoon main add kar sakti hoon." Frame `13:50` shows the account
-- list, a Default calendar and a set of Busy calendars.
--
-- WHAT WAS THERE BEFORE, and why it is worse than "only one".
-- `workspace_integration_connections` is unique on (workspace_id, provider),
-- and the OAuth callback UPSERTS on that key. So connecting a second Google
-- account did not fail — it OVERWROTE the first, silently, leaving every
-- `task_calendar_links` row that pointed at the old account orphaned. And the
-- row is owned by the workspace with a `connected_by_id`, so it was never one
-- calendar each: it was one calendar for everybody, belonging to whoever
-- connected it first.
--
-- Hence a new table rather than a relaxed constraint. The unit of ownership
-- changes from the workspace to the person, which is the load-bearing half of
-- this item; being able to add a second account falls out of it.
--
-- STILL SCOPED BY WORKSPACE as well as by user, following `user_ical_tokens`.
-- A person's calendar grant is theirs, but the tasks it mirrors are not: two
-- workspaces mirroring into one Google account through one shared grant would
-- let a task from one workspace reach a calendar the other workspace's rules
-- never sanctioned.

CREATE TABLE IF NOT EXISTS user_calendar_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider               text NOT NULL,
  -- The provider's own id for the account. Re-connecting the same account
  -- refreshes its tokens instead of adding a duplicate, which is what the
  -- unique key below is for.
  external_account_id    text NOT NULL,
  external_account_email text,
  -- Which calendar inside that account. 'primary' is Google's own name for the
  -- one named after your address — the frame's Default calendar dropdown shows
  -- an email for exactly that reason. Stored now, so per-sub-calendar choice
  -- can arrive later without a migration.
  external_calendar_id   text NOT NULL DEFAULT 'primary',
  access_token           text,
  refresh_token          text,
  token_expires_at       timestamptz,
  scopes                 text[] NOT NULL DEFAULT '{}',
  status                 text NOT NULL DEFAULT 'connected',
  -- Frame `13:50`, "Default calendar": where new events are WRITTEN.
  is_default             boolean NOT NULL DEFAULT false,
  -- Frame `13:50`, "Busy calendars": READ to decide when you are busy. On by
  -- default, because a calendar you just connected and did not want counted is
  -- rarer than one you did.
  counts_as_busy         boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_calendar_accounts_provider
    CHECK (provider IN ('gcal', 'outlook'))
);

-- The same account, twice, is a mistake rather than a second calendar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_calendar_accounts_account
  ON user_calendar_accounts (user_id, workspace_id, provider, external_account_id);

-- AT MOST ONE DEFAULT, enforced by the database rather than by whoever writes
-- the next endpoint. "Where do new events go" has one answer, and a second row
-- claiming it is not a state any code should have to resolve at read time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_calendar_accounts_default
  ON user_calendar_accounts (user_id, workspace_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_user_calendar_accounts_user
  ON user_calendar_accounts (user_id, workspace_id);

-- Carry across whatever is already connected, so nobody has to reconnect.
-- The workspace-owned row becomes the connecting person's own account, and
-- their only one, so it is the default. Skipped when the connector is unknown
-- (`connected_by_id` is nullable) — there is no honest owner to give it to.
INSERT INTO user_calendar_accounts (
  user_id, workspace_id, provider, external_account_id, external_account_email,
  access_token, refresh_token, token_expires_at, scopes, status, is_default
)
SELECT
  c.connected_by_id,
  c.workspace_id,
  c.provider,
  COALESCE(c.external_account_id, c.id::text),
  c.external_account_email,
  c.access_token,
  c.refresh_token,
  c.token_expires_at,
  c.scopes,
  c.status,
  true
FROM workspace_integration_connections c
WHERE c.provider IN ('gcal', 'outlook')
  AND c.connected_by_id IS NOT NULL
ON CONFLICT DO NOTHING;
