-- §12.10 Client invoicing. Client-facing invoices generated from a project's
-- billable time entries. Distinct from the SaaS `invoices` (Stripe subscriptions).
CREATE TABLE IF NOT EXISTS client_invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  number            text NOT NULL,
  status            text NOT NULL DEFAULT 'draft',
  currency          text NOT NULL DEFAULT 'usd',
  subtotal_cents    integer NOT NULL DEFAULT 0,
  total_cents       integer NOT NULL DEFAULT 0,
  notes             text,
  stripe_invoice_id text,
  hosted_url        text,
  issued_at         timestamptz,
  due_at            timestamptz,
  created_by_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_invoices_workspace_idx ON client_invoices (workspace_id);
CREATE INDEX IF NOT EXISTS client_invoices_client_idx ON client_invoices (client_id);

CREATE TABLE IF NOT EXISTS client_invoice_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
  description       text NOT NULL,
  quantity_minutes  integer NOT NULL DEFAULT 0,
  unit_amount_cents integer NOT NULL DEFAULT 0,
  amount_cents      integer NOT NULL DEFAULT 0,
  time_entry_ids    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_invoice_line_items_invoice_idx ON client_invoice_line_items (invoice_id);

-- Stamp a billable time entry once it has been rolled into an invoice, so it is
-- never double-invoiced.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_invoice_id uuid;
DO $$ BEGIN
  ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_client_invoice_fk
    FOREIGN KEY (client_invoice_id) REFERENCES client_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
