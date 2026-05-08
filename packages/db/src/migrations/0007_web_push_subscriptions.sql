CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_web_push_user_endpoint" UNIQUE("user_id", "endpoint"),
  CONSTRAINT "uq_web_push_endpoint" UNIQUE("endpoint")
);

CREATE INDEX IF NOT EXISTS "idx_web_push_subscriptions_user" ON "web_push_subscriptions" ("user_id");
