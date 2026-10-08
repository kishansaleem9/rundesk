-- Whether a task's start and due dates carry a time of day
-- (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`), as ClickUp's API
-- keeps `start_date_time` and `due_date_time` beside its dates.
--
-- The app read a date as having no time when its instant was UTC midnight,
-- since that is how a date picked without one is stored. A real time can be
-- UTC midnight too: 17:00 in Los Angeles in October, 05:00 in Karachi. Such a
-- time, typed and saved, came back as a date with no time.
--
-- Every row before this is read as it was read until now: a UTC midnight has
-- no time, any other instant has one.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "start_date_has_time" boolean DEFAULT false NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_date_has_time" boolean DEFAULT false NOT NULL;
UPDATE "tasks" SET
  "start_date_has_time" = "start_date" IS NOT NULL AND date_trunc('second', "start_date" AT TIME ZONE 'UTC')::time <> time '00:00',
  "due_date_has_time" = "due_date" IS NOT NULL AND date_trunc('second', "due_date" AT TIME ZONE 'UTC')::time <> time '00:00';
