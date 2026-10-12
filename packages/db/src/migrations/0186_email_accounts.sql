-- A TASK'S EMAIL FROM A MAILBOX ITS WRITER LINKED (`found-9-oct/task-email-sends-from-the-server`).
--
--   · `email_accounts`: a Gmail or Outlook mailbox a person linked, its sender name and grant.
--   · `email_account_senders`: the teammates its owner lets send from it.
--   · `email_signatures`, `email_templates`: a person's signatures; templates for them or everybody.
--   · `scheduled_task_emails`: an email set to send later, until it is sent, cancelled or refused.
--   · `task_comment_emails` gains the account, and the provider's thread and message ids by which
--     the answers are read back from the mailbox, each once.
CREATE TABLE IF NOT EXISTS "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"sender_name" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_accounts_provider_check" CHECK ("provider" IN ('gmail', 'outlook')),
	CONSTRAINT "email_accounts_status_check" CHECK ("status" IN ('connected', 'needs_reconnect'))
);
DO $$ BEGIN
 ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_accounts_workspace_address" ON "email_accounts" USING btree ("workspace_id","provider","address");
CREATE INDEX IF NOT EXISTS "idx_email_accounts_owner" ON "email_accounts" USING btree ("owner_id");
CREATE TABLE IF NOT EXISTS "email_account_senders" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_account_senders_pkey" PRIMARY KEY("account_id","user_id")
);
DO $$ BEGIN
 ALTER TABLE "email_account_senders" ADD CONSTRAINT "email_account_senders_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "email_account_senders" ADD CONSTRAINT "email_account_senders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_email_account_senders_user" ON "email_account_senders" USING btree ("user_id");
CREATE TABLE IF NOT EXISTS "email_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_email_signatures_owner" ON "email_signatures" USING btree ("workspace_id","user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_signatures_default" ON "email_signatures" USING btree ("workspace_id","user_id") WHERE "email_signatures"."is_default";
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_email_templates_workspace" ON "email_templates" USING btree ("workspace_id");
CREATE TABLE IF NOT EXISTS "scheduled_task_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"account_id" uuid,
	"to_addresses" text[] DEFAULT '{}' NOT NULL,
	"cc_addresses" text[] DEFAULT '{}' NOT NULL,
	"bcc_addresses" text[] DEFAULT '{}' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"attachment_ids" uuid[] DEFAULT '{}' NOT NULL,
	"parent_comment_id" uuid,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"error" text,
	"comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_task_emails_status_check" CHECK ("status" IN ('scheduled', 'sending', 'sent', 'cancelled', 'failed'))
);
DO $$ BEGIN
 ALTER TABLE "scheduled_task_emails" ADD CONSTRAINT "scheduled_task_emails_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "scheduled_task_emails" ADD CONSTRAINT "scheduled_task_emails_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "scheduled_task_emails" ADD CONSTRAINT "scheduled_task_emails_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "scheduled_task_emails" ADD CONSTRAINT "scheduled_task_emails_parent_comment_id_task_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "scheduled_task_emails" ADD CONSTRAINT "scheduled_task_emails_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_scheduled_task_emails_due" ON "scheduled_task_emails" USING btree ("status","send_at");
CREATE INDEX IF NOT EXISTS "idx_scheduled_task_emails_task" ON "scheduled_task_emails" USING btree ("task_id");
ALTER TABLE "task_comment_emails" ADD COLUMN IF NOT EXISTS "account_id" uuid;
ALTER TABLE "task_comment_emails" ADD COLUMN IF NOT EXISTS "provider_thread_id" text;
ALTER TABLE "task_comment_emails" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
DO $$ BEGIN
 ALTER TABLE "task_comment_emails" ADD CONSTRAINT "task_comment_emails_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "idx_task_comment_emails_thread" ON "task_comment_emails" USING btree ("account_id","provider_thread_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_comment_emails_provider_message" ON "task_comment_emails" USING btree ("account_id","provider_message_id") WHERE "task_comment_emails"."provider_message_id" is not null;
