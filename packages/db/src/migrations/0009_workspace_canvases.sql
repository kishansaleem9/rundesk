CREATE TABLE IF NOT EXISTS "workspace_canvases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
