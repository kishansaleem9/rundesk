# Imports / Exports — architecture

Settings › Imports / Exports (`/app/:ws/settings?tab=importsExports`). Phase 1 of
the Imports / Exports spec: the settings page, Export items (workspace CSV in
ClickUp's format), Import history, the import engine and the Spreadsheet importer.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `@rundesk/imports` | `packages/imports` | Pure TypeScript, used by **both** the wizard and the API: file readers (CSV/TSV/TXT, JSON, a dependency-free `.xlsx` reader), the §2.3 column catalogue, date/duration/priority/value parsers, Custom Field value rules, auto-mapping, the Task ID / Subtask IDs hierarchy, the review grid's verdicts, the `RundeskImportBundle` types, the spreadsheet adapter, and ClickUp's export header and cell serialisers. |
| Import engine | `apps/api/src/modules/imports` | Job lifecycle (`imports.service.ts`), the runner (`import-runner.service.ts`), Delete-as-a-unit (`import-cleanup.service.ts`), destination rules (`import-destination.ts`), pure decisions (`import-plan.ts`), limits (`import-limits.ts`). |
| Export jobs | `apps/api/src/modules/export/export-jobs.*`, `export-csv.ts`, `export-storage.ts` | The workspace CSV as a background job, stored and handed out by a signed link. |
| Web | `apps/web/src/components/imports/*`, `apps/web/src/lib/imports-exports-api.ts` | The settings tab, export panel, history and details, source grid, the Spreadsheet wizard and its review grid. |

The pre-engine importers (`apps/api/src/modules/integrations/clickup-import`:
the ClickUp CSV importer and the older spreadsheet importer behind
`/app/:ws/import`) are unchanged and still work. Their jobs share the job table
and appear in the same history; they cannot be deleted as a unit, because they
never recorded what they made.

## Data model (migration `0172_imports_exports.sql`)

- **`clickup_import_jobs`** — the one job table for every importer (kept under
  its old name: about a hundred break patches and suites anchor on it).
  Engine runs are the rows with `phase` set. Status: `draft` (being prepared in
  the wizard, not in the history) → `pending` (shown as **Import Queued**) →
  `processing` (**Import Pending**) → `completed` | `failed` | `cancelled`,
  and later `deleted`. Also: `cursor`, `heartbeat_at`, `cancel_requested_at`,
  `options` (destination, date format, delimiter, value maps, people to
  invite), `mapping` (header → field, and the grid's columns), `file_name`,
  `started_at`, `finished_at`, `deleted_at`, `deletable_until` (created + 10
  days), `support_reference` (Copy ID), `items_imported_count`, `result` (the
  report).
- **`import_job_items`** — every row an import made (`entity_type`,
  `entity_id`, `source_ref`, `action` created/updated/skipped/failed). Written
  in the same transaction as the row it describes. This is what Delete trashes,
  what the report's Items tab lists, and what makes a run resumable.
- **`import_errors`** — the Errors tab and `errors.csv`: refused rows
  (`error`) and dropped cells and notes (`warning`).
- **`import_mapping_memory`** — `(workspace, source, normalised header) →
  target`, saved at Start and offered first next time (§2.4).
- **`import_staged_rows`** — the reviewed rows, uploaded in chunks of about
  512 KB before Start, so a 10,000-row sheet never exceeds a request. They are
  used for "Download file", and kept 30 days.
- **`export_jobs`** — one row per export: scope, options, status, storage key,
  row count, link expiry.
- **`import_id`** (nullable, `ON DELETE SET NULL`) on spaces, folders,
  projects, lists, tasks, labels, custom field definitions, task types, the
  three status tables, checklists and time entries. `external_source` /
  `external_id` are left for Phase 2, where ClickUp and backup re-imports give
  them a meaning.

## An import, end to end

1. **Draft.** `POST /workspaces/:ws/imports` with the destination, date format
   and delimiter. The destination is checked first (`resolveDestination`), as
   creating there would be checked anywhere else.
2. **Read and review — in the browser.** The wizard reads the file with
   `readSheetFile`, pre-maps the headers with `autoMap` (memory → field labels →
   ClickUp's export headers → synonyms → Custom Field names), builds the grid
   with `buildGrid`, and colours it with `validateGrid`. Yellow means that cell
   will not import; red means that row will not.
3. **Upload.** The rows go up in chunks (`POST …/:id/upload`), then the grid's
   columns and value maps (`PUT …/:id/mapping`).
4. **Start.** `POST …/:id/start` checks the quota, saves mapping memory, sets
   `pending` / phase `queued`, writes the audit entry, and kicks the runner
   in-process.
5. **Run** (`ImportRunnerService`):
   - **claim**: one atomic update, so only one process can win a run;
   - **validating**: rebuilds the bundle from the staged rows with
     `spreadsheetBundle` (the server never trusts the browser's verdict) and
     writes skipped rows and warnings to `import_errors`;
   - **creating lists**: the destination's lists ("Imported from Spreadsheet",
     or one per `List` value);
   - **creating fields**: statuses (neutral colour, at the end, only where the
     importer may shape statuses), task types (admins and managers), tags,
     Custom Fields (through `CustomFieldsService`, flagged
     `config.importedHidden`), and people;
   - **creating tasks**: batches of 500, each in one short transaction. A batch
     that fails is retried row by row, so one bad row fails alone. Every task
     carries its assignees (only people who can see the List), tags, field
     values, checklist, tracked time and name-only subtasks;
   - **finalising**: search indexing, the report, the notification and email,
     realtime `import.completed`, and the audit entry.

   Progress (`processed` / `total` and `phase`) and `heartbeat_at` are written
   after every batch, and realtime `import.progress` goes to whoever started
   the run. Cancel sets `cancel_requested_at`; the runner stops between batches
   and marks the run `cancelled`.
6. **Recovery.** A minute cron re-claims runs queued for more than 30 seconds
   that nobody claimed, and runs whose heartbeat is more than 2 minutes old. It
   checks the shared database and each active dedicated tenant database (via
   `runWithTenantDb`). A resumed run reads `import_job_items` first and never
   makes anything twice.
7. **Delete** (within 10 days, once finished): tasks are binned with
   `deleted_at` and containers archived — the same columns their own delete
   writes, so Trash lists and restores them. Tags and task types the import
   made are removed only when nothing outside the import uses them. Statuses
   and Custom Fields added to containers that already existed are kept, because
   the import's tasks may be restored and need them.

### Subtasks

RUNDESK subtasks nest one level (`tasks.service.ts` refuses deeper). A row the
file places deeper keeps all its properties, becomes a subtask of its top-level
task, and gets a note in the report. Subtasks always go into their parent's
List.

### Destinations

Space → the space's hidden list container. Folder → a new project, "Imported
from Spreadsheet", in the folder. Project → a new List. List → the List itself.
A `List` column's values create (or reuse, by name) Lists in that same project.

## Export, end to end

1. `POST /workspaces/:ws/exports` with locations (Space, Folder, Project or
   List ids, the highest ticked ones) and a date format (Normal, ISO or POSIX).
   Requires `workspace.export`; guests are refused.
2. `ExportJobsService.build` exports every task in those Lists that the exporter
   may read (`taskInReachFilter` + `taskVisibilityFilter`) as ClickUp's 31
   columns (`exportRow`), then one column per Custom Field. The output is UTF-8
   with a BOM, quoted only where RFC 4180 needs it, with formula cells
   neutralised.
3. The file is stored in R2, or in `EXPORT_LOCAL_DIR` (default
   `<tmp>/rundesk-exports`) when R2 is not configured. It is announced by
   realtime `export.ready`, plus an in-app notice and email carrying the link.
4. `GET /exports/:id/download?expires&sig` is public but HMAC-signed
   (`EXPORT_LINK_SECRET`, falling back to `JWT_ACCESS_SECRET`) and valid for one
   hour. `GET /workspaces/:ws/exports/:id` mints a fresh link while the file is
   kept (24 hours).

## Permissions and limits

- Import routes, including the history and reports: `workspace.import` (admins
  by default; grantable by a custom role), never a guest. Export:
  `workspace.export`, never a guest.
- `import-limits.ts`, keyed by plan: 60 imports a day (none on enterprise,
  which plan gating never restricts), 10,000 rows, a 10-day delete window,
  30-day retention of uploaded rows, 1-hour export links, batches of 500.
- Audit actions: `import.started`, `import.completed`, `import.deleted`,
  `export.started`, `export.downloaded`.

## Adding a source

See `packages/imports/README.md`. In short: write an adapter that turns the
source into a `RundeskImportBundle`, give it a job `source` value, and teach the
runner's `prepare` step to build that bundle from what the source left on the
job (staged rows, a stored file, or an API connection). The writer phases and
everything after them stay as they are.

## Not in Phase 1

- **Phases 2–4:** the Document importer upgrades (`.docx`, HTML), the ClickUp
  importer moved onto the engine (CSV and API), the ClickUp-compatible CSV
  export, RUNDESK backup/restore, the app importers (Asana, Trello, Jira,
  Monday, Notion, Slack, Todoist, Wrike, Basecamp, Confluence), OAuth
  connections, view/doc/people exports, and attachments as a zip.
- **Legacy `.xls`:** refused with "Save the sheet as .xlsx or .csv" — a product
  decision, as no reader for the old binary format ships here.
- **Hidden imported fields in list views:** new fields are flagged
  `config.importedHidden`, but the list view does not yet honour the flag.
  Doing so needs the saved-view change detection taught about it.
- **No live suite (`test/e2e/*.mjs`) and no break patches yet.** These need a
  running stack to prove each patch reddens its check. `e2e/imports-exports.spec.ts`
  (Playwright, opt-in with `PW_IMPORTS_E2E=1`) drives the wizard and the export.
