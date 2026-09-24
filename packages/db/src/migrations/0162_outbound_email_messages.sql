-- The notification mail sent about a task, by Message-ID, so a reply's
-- In-Reply-To / References find the task it answers. Only inbound Message-IDs
-- were ever kept (`inbound_email_messages`), and a reply to a notification
-- names an outbound one (`resume-defects/resume-8-reply-routing`).
CREATE TABLE IF NOT EXISTS "outbound_email_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" text NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "list_id" uuid NOT NULL REFERENCES "lists"("id") ON DELETE CASCADE,
  "recipient" text NOT NULL,
  "reply_to" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_outbound_email_messages_message_id" UNIQUE ("message_id")
);
CREATE INDEX IF NOT EXISTS "idx_outbound_email_messages_task" ON "outbound_email_messages" ("task_id");
