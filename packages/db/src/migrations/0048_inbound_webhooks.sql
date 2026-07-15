-- Per-list inbound webhooks to create tasks from external POSTs (Plan §12).
CREATE TABLE IF NOT EXISTS "inbound_webhooks" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "list_id"       uuid NOT NULL REFERENCES "lists"("id") ON DELETE CASCADE,
  "token"         text NOT NULL UNIQUE,
  "name"          text NOT NULL,
  "is_enabled"    boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
