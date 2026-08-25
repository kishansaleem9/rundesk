-- §15 — Skills: a named, reusable AI playbook, plus the two things she named
-- alongside it.
--
--   "Ab yeh jo SKILL wali cheez hai na, yeh ek ClickUp ka NEW FEATURE hai" [17:38]
--   "Yeh MEMORY hai — yeh hum jo bhi baat karenge woh STORE karega apne andar" [18:42]
--   "yeh CONNECTIONS hai — main is ko kisi bhi system mein CONNECT kar sakti hoon" [18:58]
--
-- Three tables, one per pillar. `skill_connections` binds to the workspace's
-- existing OAuth grant rather than storing a second copy of it, so revoking
-- the integration revokes every skill that leans on it in one move.

CREATE TABLE IF NOT EXISTS "skills" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"          text NOT NULL,
  "description"   text,
  "instructions"  text DEFAULT '' NOT NULL,
  "archetype"     text DEFAULT 'scratch' NOT NULL,
  "visibility"    text DEFAULT 'private' NOT NULL,
  "enabled"       boolean DEFAULT true NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_skills_ws_owner_name" UNIQUE ("workspace_id", "created_by_id", "name")
);

CREATE INDEX IF NOT EXISTS "idx_skills_workspace" ON "skills" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_skills_ws_owner" ON "skills" ("workspace_id", "created_by_id");

CREATE TABLE IF NOT EXISTS "skill_memories" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id"     uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "author_id"    uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "content"      text NOT NULL,
  "source"       text DEFAULT 'manual' NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_skill_memories_skill" ON "skill_memories" ("skill_id", "created_at");

CREATE TABLE IF NOT EXISTS "skill_connections" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "skill_id"      uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider"      text NOT NULL,
  "connection_id" uuid REFERENCES "workspace_integration_connections"("id") ON DELETE SET NULL,
  "config"        jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_skill_connections_skill_provider" UNIQUE ("skill_id", "provider")
);

CREATE INDEX IF NOT EXISTS "idx_skill_connections_skill" ON "skill_connections" ("skill_id");
