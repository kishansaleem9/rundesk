-- Custom roles & permissions per workspace. Augments — does not replace —
-- the legacy 4-role enum on workspace_members.

CREATE TABLE IF NOT EXISTS "custom_roles" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"  uuid NOT NULL,
  "name"          text NOT NULL,
  "description"   text,
  "color"         text NOT NULL DEFAULT '#64748b',
  "is_locked"     boolean NOT NULL DEFAULT false,
  "position"      integer NOT NULL DEFAULT 0,
  "created_by_id" uuid,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "custom_roles"
    ADD CONSTRAINT "custom_roles_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "custom_roles"
    ADD CONSTRAINT "custom_roles_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "custom_roles"
    ADD CONSTRAINT "uq_custom_roles_workspace_name" UNIQUE ("workspace_id", "name");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_custom_roles_workspace_position"
  ON "custom_roles" ("workspace_id", "position");

CREATE TABLE IF NOT EXISTS "custom_role_permissions" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_id"    uuid NOT NULL,
  "permission" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "custom_role_permissions"
    ADD CONSTRAINT "custom_role_permissions_role_fk"
    FOREIGN KEY ("role_id") REFERENCES "custom_roles"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "custom_role_permissions"
    ADD CONSTRAINT "uq_custom_role_permissions_role_permission" UNIQUE ("role_id", "permission");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_custom_role_permissions_permission"
  ON "custom_role_permissions" ("permission");

CREATE TABLE IF NOT EXISTS "workspace_member_custom_roles" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_member_id"  uuid NOT NULL,
  "role_id"              uuid NOT NULL,
  "assigned_by_id"       uuid,
  "assigned_at"          timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "workspace_member_custom_roles"
    ADD CONSTRAINT "workspace_member_custom_roles_member_fk"
    FOREIGN KEY ("workspace_member_id") REFERENCES "workspace_members"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workspace_member_custom_roles"
    ADD CONSTRAINT "workspace_member_custom_roles_role_fk"
    FOREIGN KEY ("role_id") REFERENCES "custom_roles"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workspace_member_custom_roles"
    ADD CONSTRAINT "workspace_member_custom_roles_assigned_by_fk"
    FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "workspace_member_custom_roles"
    ADD CONSTRAINT "uq_workspace_member_custom_roles_member_role" UNIQUE ("workspace_member_id", "role_id");
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_workspace_member_custom_roles_member"
  ON "workspace_member_custom_roles" ("workspace_member_id");
