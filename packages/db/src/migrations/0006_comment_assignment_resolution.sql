ALTER TABLE "task_comments"
ADD COLUMN IF NOT EXISTS "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
