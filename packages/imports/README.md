# @rundesk/imports

The pure half of Settings › Imports / Exports. It is shared by the import
wizard (in the browser) and the API, which judges the same rows again. It
contains no database code, no Node-only imports in `src/*.ts` (tests excepted),
and nothing that needs a DOM.

- **Readers:** `readSheetFile` (CSV/TSV/TXT/JSON/.xlsx), `readDelimited`, `readXlsx`, `readJsonSheet`
- **Spreadsheet rules:** `TASK_COLUMNS`, `parseImportDate`, `parseDuration`, `parsePriority`, `parseCustomCell`, `autoMap`, `buildHierarchy`, `buildGrid`, `validateGrid`, `rowDraft`
- **The intermediate format:** `RundeskImportBundle` and `spreadsheetBundle`
- **Export format:** `CLICKUP_EXPORT_HEADERS`, `dateCells`, `exportCsv` and friends

```
pnpm --filter @rundesk/imports test       # node:test via tsx
pnpm --filter @rundesk/imports typecheck
```

## Adding a source adapter

Every importer feeds the same writer through a `RundeskImportBundle`
(`src/bundle.ts`). A new source needs four things.

1. **The adapter.** Write a pure function from the source's data to a bundle,
   as `spreadsheetBundle` does. Keep the source's own ids in `sourceId`; link
   records by source id (`parentSourceId`, `listSourceId`, and assignees by
   email or source user id). Never use RUNDESK ids here: the writer resolves
   them. Report what cannot be imported (skipped records, dropped values) beside
   the bundle, so it reaches the report's Errors tab.
2. **Tests** next to it, with a fixture in `test/fixtures/imports/` read end to
   end as `fixtures.test.ts` does.
3. **A job `source` value.** `IMPORT_SOURCES` lists the names reserved for
   later phases.
4. **The engine's side** (`apps/api/src/modules/imports`):
   - `ImportsService.create` accepts the source;
   - the runner's `prepare` builds the bundle from what the source left on the
     job (staged rows, a stored file, or an API connection);
   - if the source needs mapping screens (users, statuses, fields), its
     `preview` answers them.

   The writer phases (lists → statuses, task types, tags, fields, people →
   tasks → finalise), the item registry, resume, cancel, Delete and the history
   need no change.

**Throttle and page sources that fetch over an API.** Respect `429` /
`Retry-After` and save progress in the job's `cursor`, so a resumed run carries
on from where it stopped instead of refetching.
