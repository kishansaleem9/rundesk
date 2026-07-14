-- Clients + project→client billing link (Plan §9). Additive + idempotent.
CREATE TABLE IF NOT EXISTS "clients" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"          text NOT NULL,
  "contact_email" text,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "clients_workspace_name_unique"
  ON "clients" ("workspace_id", "name");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_id" uuid;

DO $$ BEGIN
  ALTER TABLE "projects"
    ADD CONSTRAINT "projects_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
