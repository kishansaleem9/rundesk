-- §5.7 Workspace-default dashboard for admins.
-- A preset flagged is_workspace_default applies to any member without a personal
-- default. At most one active per workspace (enforced in the service layer).
ALTER TABLE dashboard_presets ADD COLUMN IF NOT EXISTS is_workspace_default boolean NOT NULL DEFAULT false;
