-- Imports / Exports — the engine behind Settings › Imports / Exports.
--
-- ONE JOB TABLE STILL. `clickup_import_jobs` already holds every import run
-- (ClickUp CSV and the spreadsheet importer, told apart by `source`), and the
-- history, the progress bar and the poller all read it; a second job table
-- would be a second history that drifts. So it is widened again:
--
--   phase / cursor / heartbeat_at   a run writes where it is after every batch,
--                                   so a run cut off by a restart is picked up
--                                   from its last batch rather than left
--                                   "processing" for ever;
--   cancel_requested_at             Cancel is a request the runner honours
--                                   between batches, never a kill mid-write;
--   options / mapping / file_name   what the person chose, for the report's
--                                   Settings tab and for a resumed run;
--   deletable_until                 "You can delete any imports created in the
--                                   last 10 days";
--   support_reference               the short id "Copy ID" copies.
--
-- `status` gains 'cancelled' and 'deleted' beside pending (shown as Import
-- Queued), processing (Import Pending), completed and failed. It has never had
-- a CHECK, and it does not get one here: older rows hold the old four.
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS cursor jsonb;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS options jsonb;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS mapping jsonb;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS deletable_until timestamptz;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS support_reference text;
ALTER TABLE clickup_import_jobs ADD COLUMN IF NOT EXISTS items_imported_count integer NOT NULL DEFAULT 0;

-- The recovery sweep's query: runs that should be moving and have not said so lately.
CREATE INDEX IF NOT EXISTS clickup_import_jobs_status_idx
  ON clickup_import_jobs (status, heartbeat_at);

-- EVERY ROW AN IMPORT MAKES, BY ID. This is what "Delete" deletes and what the
-- report's Items tab lists. Skipped and failed rows are recorded too (with no
-- entity), so the report can say why a row is not there.
CREATE TABLE IF NOT EXISTS import_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES clickup_import_jobs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  source_ref text,
  action text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_job_items_action_check CHECK (action IN ('created', 'updated', 'skipped', 'failed'))
);
CREATE INDEX IF NOT EXISTS import_job_items_job_type_idx ON import_job_items (job_id, entity_type);
CREATE INDEX IF NOT EXISTS import_job_items_entity_idx ON import_job_items (entity_type, entity_id);

-- The report's Errors tab and errors.csv: every refusal and every dropped
-- cell, not only the first 200 that fit in `row_errors`.
CREATE TABLE IF NOT EXISTS import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES clickup_import_jobs(id) ON DELETE CASCADE,
  row_ref text,
  field text,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_errors_severity_check CHECK (severity IN ('error', 'warning'))
);
CREATE INDEX IF NOT EXISTS import_errors_job_idx ON import_errors (job_id);

-- §2.4 historical mapping: the field this workspace chose for a header, reused next time.
CREATE TABLE IF NOT EXISTS import_mapping_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'spreadsheet',
  normalised_header text NOT NULL,
  target_field_key text NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_mapping_memory_header_key
  ON import_mapping_memory (workspace_id, source, normalised_header);

-- The reviewed rows, uploaded in chunks before Start (a 10,000-row sheet does
-- not fit one request). Kept 30 days for "Download file", then purged.
CREATE TABLE IF NOT EXISTS import_staged_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES clickup_import_jobs(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  rows jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_staged_rows_chunk_key ON import_staged_rows (job_id, chunk_index);

-- Exports run as jobs too: a large workspace's CSV is built off the request,
-- stored, and handed out through a link that expires an hour after it is made.
CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  scope jsonb,
  options jsonb,
  status text NOT NULL DEFAULT 'pending',
  storage_key text,
  file_name text,
  size_bytes integer,
  row_count integer,
  error text,
  download_expires_at timestamptz,
  support_reference text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT export_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);
CREATE INDEX IF NOT EXISTS export_jobs_workspace_idx ON export_jobs (workspace_id, created_at);

-- WHICH IMPORT MADE THIS ROW. Nullable everywhere — almost nothing is
-- imported — and SET NULL, so a job row can never take the work it made with it.
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE lists ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE labels ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE task_types ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE list_statuses ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE space_statuses ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES clickup_import_jobs(id) ON DELETE SET NULL;

-- Tasks are the one table an import fills by the thousand.
CREATE INDEX IF NOT EXISTS idx_tasks_import ON tasks (import_id) WHERE import_id IS NOT NULL;

-- In-app notices for a finished import and a ready export. `IF NOT EXISTS`
-- because `drizzle-kit push` may already have added them from the TS enum.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'import_completed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'import_failed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'export_ready';
