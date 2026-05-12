CREATE TABLE IF NOT EXISTS "doc_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "doc_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "author_id" uuid,
  "parent_comment_id" uuid,
  "body" text NOT NULL,
  "selection" jsonb,
  "is_resolved" boolean DEFAULT false NOT NULL,
  "resolved_by_id" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_parent_comment_id_doc_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."doc_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_comments" ADD CONSTRAINT "doc_comments_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_comments_doc" ON "doc_comments" USING btree ("doc_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_doc_comments_thread" ON "doc_comments" USING btree ("doc_id","parent_comment_id");
