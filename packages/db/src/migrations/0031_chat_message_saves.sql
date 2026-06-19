-- Per-user saved/bookmarked chat messages (private to each user).
CREATE TABLE IF NOT EXISTS "chat_message_saves" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "user_id"    uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "chat_message_saves" ADD CONSTRAINT "chat_message_saves_message_fk"
    FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "chat_message_saves" ADD CONSTRAINT "chat_message_saves_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_saves_unique" ON "chat_message_saves" ("message_id","user_id");
