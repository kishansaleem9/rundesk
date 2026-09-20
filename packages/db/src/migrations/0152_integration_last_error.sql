-- §V2-11, frame `18:39` — the integration error card says what went wrong.
--
-- The frame draws a card with a red mark, a bold line, a body and a link:
--
--   We couldn't connect your Google account.
--   Google gave us this error: OAuth authentication timed out. Please try
--   again. If it keeps happening, try checking your permissions — that often
--   does the trick.
--   [ Help center article ]
--
-- "Google gave us this error: …" is the whole point of the card, and it was
-- the one thing Rundesk could not say. The only failure text in the product
-- was a `?reason=` query parameter on the post-OAuth redirect: it belongs to a
-- page load rather than to an integration, it is gone on the next navigation,
-- and it was not even pointed at the page that reads it (the failure redirect
-- landed on `/app`, while the banner that renders `?oauth=error` lives on
-- `/app/:workspaceId/integrations`). So the card could report that SOMETHING
-- had failed and never which integration or why.
--
-- NULLABLE, with null meaning "nothing is wrong". Defaulting to '' would give
-- every healthy connection an error card containing no error.
ALTER TABLE workspace_integration_connections
  ADD COLUMN IF NOT EXISTS last_error text;

-- Kept beside it so the card can say WHEN, and so a stale failure on a
-- connection that has since been reconnected is recognisable as stale rather
-- than being read as current. The connect path clears both together.
ALTER TABLE workspace_integration_connections
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

COMMENT ON COLUMN workspace_integration_connections.last_error IS
  'Verbatim provider failure from the most recent connect/refresh attempt. NULL = healthy. Cleared on a successful connect.';
