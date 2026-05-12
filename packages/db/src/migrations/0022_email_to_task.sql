-- Email-to-task: per-list inbound email aliases + audited message log.

CREATE TABLE IF NOT EXISTS "list_email_aliases" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id"           uuid NOT NULL,
  "local_part"        text NOT NULL,
  "default_priority"  text NOT NULL DEFAULT 'normal',
  "created_by_id"     uuid,
  "revoked_at"        timestamp with time zone,
  "last_used_at"      timestamp with time zone,
  "created_at"        timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"        timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "list_email_aliases"
    ADD CONSTRAINT "list_email_aliases_list_fk"
    FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "list_email_aliases"
    ADD CONSTRAINT "list_email_aliases_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "list_email_aliases"
    ADD CONSTRAINT "uq_list_email_aliases_list" UNIQUE ("list_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "list_email_aliases"
    ADD CONSTRAINT "uq_list_email_aliases_local_part" UNIQUE ("local_part");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "inbound_email_messages" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id"           uuid,
  "task_id"           uuid,
  "message_id"        text NOT NULL,
  "in_reply_to"       text,
  "from_address"      text NOT NULL,
  "from_name"         text,
  "recipient"         text NOT NULL,
  "subject"           text,
  "bytes"             integer NOT NULL DEFAULT 0,
  "attachment_count"  integer NOT NULL DEFAULT 0,
  "outcome"           text NOT NULL,
  "reason"            text,
  "received_at"       timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "inbound_email_messages"
    ADD CONSTRAINT "inbound_email_messages_list_fk"
    FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inbound_email_messages"
    ADD CONSTRAINT "inbound_email_messages_task_fk"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inbound_email_messages"
    ADD CONSTRAINT "uq_inbound_email_messages_message_id" UNIQUE ("message_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_inbound_email_messages_in_reply_to"
  ON "inbound_email_messages" ("in_reply_to");
CREATE INDEX IF NOT EXISTS "idx_inbound_email_messages_task"
  ON "inbound_email_messages" ("task_id");
