-- §9.5 Scheduled report delivery — email a saved custom report to recipients on
-- a daily/weekly cadence. Adds the scheduling fields to custom_reports; the
-- hourly ScheduledReportsService cron selects due reports (frequency + send
-- hour, weekly weekday) and gates re-sends with last_sent_at.
--
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
-- safe to re-run. schedule_recipients defaults to an empty array; the runner
-- falls back to the report owner's email when it is empty, so an owner-only
-- schedule needs no explicit recipient list.
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "schedule_frequency" text NOT NULL DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "schedule_hour" integer NOT NULL DEFAULT 8;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "schedule_day_of_week" integer;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "schedule_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD COLUMN IF NOT EXISTS "last_sent_at" timestamptz;--> statement-breakpoint
-- Partial index so the hourly scheduler scans only reports that are actually
-- scheduled, not every saved report.
CREATE INDEX IF NOT EXISTS "idx_custom_reports_scheduled" ON "custom_reports" ("schedule_frequency") WHERE "schedule_frequency" <> 'none';
