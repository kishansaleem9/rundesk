-- THE IMPORTERS AS CLICKUP HAS THEM (`commit-log/log-601eacc-2`, `ledger-rows/row-816`).
--
--   · `chat_messages.imported_author`: the name a message imported from Slack was written under,
--     when its author is nobody in this workspace. The message is kept under the person who
--     imported it, and drawn under this name.
--   · `import_grants`: a person's grant to read another tool for an import — Basecamp, signed in
--     to from the import page — kept for them alone until they take it away.
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "imported_author" text;
CREATE TABLE IF NOT EXISTS "import_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"account" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_grants_provider_check" CHECK ("provider" IN ('basecamp'))
);
DO $$ BEGIN
 ALTER TABLE "import_grants" ADD CONSTRAINT "import_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "import_grants" ADD CONSTRAINT "import_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_import_grants_owner" ON "import_grants" USING btree ("workspace_id","user_id","provider");
