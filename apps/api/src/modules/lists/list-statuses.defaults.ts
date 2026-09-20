import { listStatuses } from '@rundesk/db'

/**
 * The default status pipeline, and the one way to put it on a list.
 *
 * THIS EXISTS BECAUSE SEEDING WAS ONLY EVER DONE IN ONE OF SEVEN PLACES.
 * `ListsService.create` seeded the pipeline; the other six paths that insert
 * into `lists` did not:
 *
 *   · `WorkspacesService.create` — every workspace's starter list
 *   · `ProjectTemplatesService.apply` — every list from a template
 *   · `SampleDataService` — the sample workspace
 *   · `ClickUpImportService` — every imported list
 *   · `SpreadsheetImportService` — (this one does seed; its comment says why)
 *   · `packages/db/src/seed.ts` — the seeded database CI and every developer
 *     runs against, which is how two status-less lists were sitting in it
 *
 * A list with no statuses is not merely cosmetically odd. `resolveStatusForList`
 * used to answer `{ key: requestedKey, category: 'open' }` for ANY key when the
 * list had none, so a task could be set to `done`, store `status = 'done'`, and
 * keep `statusCategory = 'open'` — accepted, no 400, no warning. The UI shows
 * the status the person chose; lists, reports, planner, Workload and the teams
 * work preview all reason on the CATEGORY. They disagree, permanently and
 * silently. Work completed in a new workspace's first list never counted as
 * completed.
 *
 * So: one array, one helper, and every creation path calls it.
 */
export const DEFAULT_LIST_STATUSES = [
  { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,        position: 0 },
  { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,        position: 1 },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const, position: 2 },
  { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const, position: 3 },
  { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,      position: 4 },
  { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,      position: 5 },
]

/**
 * Give `listId` the default pipeline.
 *
 * Takes the db handle rather than closing over one, so a caller already inside
 * a transaction passes `tx` and the list and its statuses commit together —
 * which is the difference between "a list briefly has no statuses" and "a list
 * permanently has no statuses because the outer insert succeeded and this did
 * not". `onConflictDoNothing` makes it safe to call on a list that already has
 * them, so a backfill and a fresh create can share one code path.
 */
export async function seedListStatuses(
  db: { insert: (t: typeof listStatuses) => any },
  listId: string,
): Promise<void> {
  await db
    .insert(listStatuses)
    .values(DEFAULT_LIST_STATUSES.map((s) => ({ listId, ...s })))
    .onConflictDoNothing()
}
