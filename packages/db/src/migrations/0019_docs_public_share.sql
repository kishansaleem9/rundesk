-- Public anonymous share for docs.
-- A non-null public_share_id slug means the doc is readable anonymously
-- via /d/<slug>; null means the share is disabled. The slug is unique so it
-- doubles as the lookup key for the public viewer route.

ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "public_share_id" text;
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "public_share_enabled_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "docs" ADD CONSTRAINT "docs_public_share_id_unique" UNIQUE ("public_share_id");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_docs_public_share_id" ON "docs" ("public_share_id");
