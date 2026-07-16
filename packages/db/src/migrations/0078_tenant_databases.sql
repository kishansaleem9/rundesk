-- §14.2 Optional dedicated-database tier for enterprise. Maps an organization to
-- its own Postgres connection string; the connection resolver routes that org's
-- queries to the dedicated database when the row is active, else the shared cluster.
CREATE TABLE IF NOT EXISTS tenant_databases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_url   text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  label            text,
  last_checked_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE tenant_databases ADD CONSTRAINT uq_tenant_databases_organization UNIQUE (organization_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
