-- A feature-flag switch is one row per flag, scope, scope id and workspace
-- (`found-29-sep/platform-flag-switches-apply-nowhere`). The unique key ran
-- over nullable columns, and NULLs are distinct, so every platform switch —
-- no scope id, no workspace — inserted another row, and which one a read
-- applied was the table's order. The newest of each is kept, and the key now
-- treats NULLs as equal, so a switch updates its row.
DELETE FROM "feature_flags" f
USING "feature_flags" g
WHERE f."flag_key" = g."flag_key"
  AND f."scope" = g."scope"
  AND f."scope_id" IS NOT DISTINCT FROM g."scope_id"
  AND f."workspace_id" IS NOT DISTINCT FROM g."workspace_id"
  AND (f."updated_at", f."id") < (g."updated_at", g."id");
--> statement-breakpoint
ALTER TABLE "feature_flags" DROP CONSTRAINT IF EXISTS "uq_flag_scope";
--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "uq_flag_scope" UNIQUE NULLS NOT DISTINCT ("flag_key","scope","scope_id","workspace_id");
