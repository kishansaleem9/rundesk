-- §5 per-space view config (ClickUp "required views"): which task views a
-- space's lists expose + the default view. null = all enabled, 'list' default.
ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "view_config" jsonb;
