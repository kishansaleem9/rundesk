-- Reusable checklists that can be applied to any task ("QA pass", "Client
-- onboarding"). Items are copied on apply, so editing a template later never
-- rewrites checklists already created from it.
CREATE TABLE IF NOT EXISTS "checklist_templates" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"  uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name"          text NOT NULL,
  "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "checklist_template_items" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_id" uuid NOT NULL REFERENCES "checklist_templates"("id") ON DELETE CASCADE,
  "content"     text NOT NULL,
  "position"    integer NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "checklist_templates_workspace_idx"
  ON "checklist_templates" ("workspace_id");
CREATE INDEX IF NOT EXISTS "checklist_template_items_template_idx"
  ON "checklist_template_items" ("template_id");
