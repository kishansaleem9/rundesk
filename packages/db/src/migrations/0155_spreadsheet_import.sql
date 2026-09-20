-- §V2-S13 — the **Imports** submenu, frame `12:08`.
--
-- The frame draws twelve rows: Spreadsheet files, Document files, and ten named
-- tools (Asana, Basecamp, Confluence, Jira Software, Monday, Notion, Slack,
-- Todoist, Trello, Wrike). Rundesk shipped one importer — a ClickUp CSV reader
-- — and `clickup_import_jobs` was named and shaped for exactly that.
--
-- This widens the SAME job table rather than adding a second one, because the
-- generic spreadsheet importer produces the same kind of run: a row count, a
-- progress cursor, per-outcome tallies and a final report. Two tables would
-- mean two pollers, two progress bars and two histories that drift.
--
-- `source` is not a label. `listJobs` filters on it, so the import page's
-- history can show the spreadsheet runs without the ClickUp ones; the index
-- below is that query's index.
ALTER TABLE clickup_import_jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'clickup_csv';

-- Which per-source column preset was applied ('trello', 'jira', … 'generic').
-- Nullable: the ClickUp path has no preset and must not be given a fake one.
ALTER TABLE clickup_import_jobs
  ADD COLUMN IF NOT EXISTS source_preset text;

-- REJECTED IS NOT SKIPPED. `skipped_count` is a duplicate the person chose to
-- skip; `rejected_count` is a row the importer refused — no name, an
-- unparseable due date, a misquoted line. Folding the two together is how
-- "imported 9 of 10" becomes unanswerable.
ALTER TABLE clickup_import_jobs
  ADD COLUMN IF NOT EXISTS rejected_count integer NOT NULL DEFAULT 0;

-- One entry per refused row: { row, code, message, column, value }. `row` is
-- the 1-based LINE NUMBER in the uploaded file (line 1 being the header), so
-- the report points at something the person can open and fix.
ALTER TABLE clickup_import_jobs
  ADD COLUMN IF NOT EXISTS row_errors jsonb;

CREATE INDEX IF NOT EXISTS clickup_import_jobs_source_idx
  ON clickup_import_jobs (workspace_id, source);
