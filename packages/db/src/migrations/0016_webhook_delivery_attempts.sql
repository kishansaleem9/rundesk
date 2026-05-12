ALTER TABLE "webhook_deliveries"
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 1;
