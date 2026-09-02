-- G04-7 [05:29] / G07-6 [08:26–08:31] — the sidebar arrangement follows the
-- person, not the browser.
--
-- Both lists lived in localStorage (`rundesk.navFavorites.<workspaceId>` and
-- `rundesk.navRecents.<workspaceId>`) while everything else about a user —
-- theme, locale, notification preferences, and the dock appearance already
-- sitting in this same row — was server-persisted. Clear the browser, use
-- another machine, or open a private window, and a sidebar somebody had
-- arranged reverted to four hard-coded defaults.
--
-- Nullable rather than `default '[]'`: "never arranged it" and "arranged it to
-- be empty" are different answers, and only the first should be given the
-- defaults. A NOT NULL default would make every existing row look like a
-- deliberate empty list.

ALTER TABLE user_dock_configs
  ADD COLUMN IF NOT EXISTS nav_favorites jsonb,
  ADD COLUMN IF NOT EXISTS nav_recents   jsonb;
