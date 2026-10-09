-- The comment box posts as Email, as ClickUp's Email ClickApp does (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`):
-- a comment's channel, the email it was, and the comment an outbound email belongs to, so a reply is threaded under it.
ALTER TABLE "task_comments" ADD COLUMN IF NOT EXISTS "channel" text DEFAULT 'comment' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_channel_check" CHECK ("channel" IN ('comment', 'email'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comment_emails" (
  "comment_id" uuid PRIMARY KEY NOT NULL,
  "direction" text NOT NULL,
  "from_address" text NOT NULL,
  "to_addresses" text[] DEFAULT '{}' NOT NULL,
  "cc_addresses" text[] DEFAULT '{}' NOT NULL,
  "bcc_addresses" text[] DEFAULT '{}' NOT NULL,
  "subject" text NOT NULL,
  "message_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comment_emails" ADD CONSTRAINT "task_comment_emails_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comment_emails" ADD CONSTRAINT "task_comment_emails_direction_check" CHECK ("direction" IN ('out', 'in'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "outbound_email_messages" ADD COLUMN IF NOT EXISTS "comment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outbound_email_messages" ADD CONSTRAINT "outbound_email_messages_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
