-- Optional cover color/gradient for the task detail header.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "cover_color" text;
