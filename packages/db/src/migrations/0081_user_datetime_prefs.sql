-- Per-user date / time / week-start display preferences (Plan §1.2). 'system'
-- keeps the browser-locale default; explicit values override how dates and
-- times render across the app. Additive + idempotent so it is safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_format" text NOT NULL DEFAULT 'system';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "time_format" text NOT NULL DEFAULT 'system';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "week_start" text NOT NULL DEFAULT 'sunday';
