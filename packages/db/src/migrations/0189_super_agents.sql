-- SUPER AGENTS AS CLICKUP HAS THEM (`commit-log/log-214dac0-1`, `ledger-rows/row-852`).
--
--   · `users.is_agent`: an agent's own account — what it is mentioned, assigned and messaged as.
--   · `super_agents`: its profile — instructions, triggers, skills (tools), knowledge, privacy, on or off.
--   · `super_agent_access`: who a private agent is shared with.
--   · `super_agent_memories`: what it remembers — recent work, preferences (once approved), its own notes.
--   · `super_agent_runs`: every run — what started it, who, where, and how it ended.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_agent" boolean DEFAULT false NOT NULL;
CREATE TABLE IF NOT EXISTS "super_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"avatar_color" text DEFAULT '#7c3aed' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"knowledge" jsonb DEFAULT '{"locations":[],"help":false}'::jsonb NOT NULL,
	"triggers" jsonb NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "super_agent_access" (
	"agent_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_agent_access_agent_id_user_id_pk" PRIMARY KEY("agent_id","user_id")
);
CREATE TABLE IF NOT EXISTS "super_agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "super_agent_memories_kind_check" CHECK ("kind" IN ('recent', 'preference', 'intelligence'))
);
CREATE TABLE IF NOT EXISTS "super_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by_id" uuid,
	"location" jsonb,
	"input" text DEFAULT '' NOT NULL,
	"output" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "super_agent_runs_trigger_check" CHECK ("trigger" IN ('mention', 'dm', 'assign', 'schedule', 'automation', 'manual')),
	CONSTRAINT "super_agent_runs_status_check" CHECK ("status" IN ('running', 'completed', 'failed', 'skipped'))
);
DO $$ BEGIN
 ALTER TABLE "super_agents" ADD CONSTRAINT "super_agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agents" ADD CONSTRAINT "super_agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agents" ADD CONSTRAINT "super_agents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_access" ADD CONSTRAINT "super_agent_access_agent_id_super_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."super_agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_access" ADD CONSTRAINT "super_agent_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_memories" ADD CONSTRAINT "super_agent_memories_agent_id_super_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."super_agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_memories" ADD CONSTRAINT "super_agent_memories_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_runs" ADD CONSTRAINT "super_agent_runs_agent_id_super_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."super_agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_runs" ADD CONSTRAINT "super_agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
 ALTER TABLE "super_agent_runs" ADD CONSTRAINT "super_agent_runs_triggered_by_id_users_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "super_agents_workspace_idx" ON "super_agents" USING btree ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "super_agents_user_unique" ON "super_agents" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "super_agent_memories_agent_idx" ON "super_agent_memories" USING btree ("agent_id","created_at");
CREATE INDEX IF NOT EXISTS "super_agent_runs_workspace_idx" ON "super_agent_runs" USING btree ("workspace_id","started_at");
CREATE INDEX IF NOT EXISTS "super_agent_runs_agent_idx" ON "super_agent_runs" USING btree ("agent_id","started_at");
