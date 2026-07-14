-- Persisted, auto-materialising task recurrence. Additive + idempotent.
-- Stores the recurrence config on the task itself (cadenceDays or a rule) so
-- completing a recurring task can auto-create the next occurrence and hand the
-- recurrence forward to it. NULL (the default, and all existing rows) means the
-- task does not recur — no behaviour change.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence" jsonb;
