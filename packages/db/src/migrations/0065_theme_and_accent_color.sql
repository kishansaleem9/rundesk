-- §13.1 Dark mode cross-device persistence + §13.5 custom branding accent color.
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS), safe to re-run.
--
-- users.theme: per-user UI theme preference. Hydrated from GET /users/me on load
-- and kept in sync with the topbar toggle + the profile appearance selector.
-- 'system' follows the OS setting (the prior localStorage-only default).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "theme" text NOT NULL DEFAULT 'system';--> statement-breakpoint
-- workspaces.accent_color: an optional secondary brand color applied app-wide
-- alongside the existing primary_color. Drives the --accent CSS variable the
-- design system reads for highlights/interactive accents. Null = design default.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "accent_color" text;
