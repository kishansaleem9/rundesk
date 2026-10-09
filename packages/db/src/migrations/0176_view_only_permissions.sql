-- ClickUp's four individual permissions for view-only members and guests, per person, with its
-- defaults: time estimates and time tracking on, tags and creating views off
-- (`found-25-sep/view-only-individual-permissions`). Asked only where a person's level is View.
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "view_only_time_estimates" boolean DEFAULT true NOT NULL;
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "view_only_time_tracking" boolean DEFAULT true NOT NULL;
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "view_only_tags" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "view_only_create_views" boolean DEFAULT false NOT NULL;
