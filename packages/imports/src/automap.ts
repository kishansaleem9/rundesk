/**
 * §2.4 — pre-map incoming headers to RUNDESK fields, in this order of trust:
 *   1. what this workspace chose for the same header last time (mapping memory),
 *      then, importing an app's export, that app's own column names (`sources.ts`),
 *   2. the field's own label (`Task Name`, `Due Date`, …),
 *   3. ClickUp's export headers (§5.1/§6.1), so its CSV maps with no clicks,
 *   4. common synonyms, including the column names Asana, Jira, Monday, Notion,
 *      Todoist, Trello and Wrike write in their CSV exports,
 *   5. a Custom Field in the destination with the same name.
 * Anything else starts on "skip": "Incoming fields not mapped to a RUNDESK
 * field will be excluded."
 */

import { TASK_COLUMNS, type ColumnMapping, type MappingTarget, type TaskColumnKey } from './columns'

/** Lower-case, `_`/`-` as spaces, no `*` or trailing `:`, single spaces. */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[*:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Where a header resolves to Parent ID, its rows' parents are turned into `Subtask IDs` (§2.4). */
export type AutoMapTarget = MappingTarget | 'parentId'

/** ClickUp's export header row (§5.1), normalised → target. `skip` = read-only or a `… Text` twin. */
const CLICKUP_EXPORT: Record<string, AutoMapTarget> = {
  'task id': 'taskId',
  'task link': 'skip',
  'task type': 'taskType',
  'task custom id': 'skip',
  'task name': 'taskName',
  'task description': 'description',
  status: 'status',
  'date created': 'dateCreated',
  'date created text': 'skip',
  'due date': 'dueDate',
  'due date text': 'skip',
  'start date': 'startDate',
  'start date text': 'skip',
  'parent id': 'parentId',
  'subtask ids': 'subtaskIds',
  attachments: 'skip',
  assignees: 'assignees',
  tags: 'tags',
  priority: 'priority',
  'list name': 'list',
  'folder name': 'skip',
  'space name': 'skip',
  'time estimated': 'timeEstimate',
  'time estimated text': 'skip',
  checklists: 'checklist',
  comments: 'skip',
  'assigned comments': 'skip',
  'time spent': 'timeTracked',
  'time spent text': 'skip',
  'rolled up time': 'skip',
  'rolled up time text': 'skip',
}

const SYNONYMS: Record<string, TaskColumnKey | 'parentId'> = {
  name: 'taskName',
  title: 'taskName',
  summary: 'taskName',
  task: 'taskName',
  'task title': 'taskName',
  'card name': 'taskName',
  content: 'taskName',
  'assignee(s)': 'assignees',
  assignee: 'assignees',
  owner: 'assignees',
  'assigned to': 'assignees',
  'assignee email': 'assignees',
  responsible: 'assignees',
  members: 'assignees',
  person: 'assignees',
  due: 'dueDate',
  deadline: 'dueDate',
  duedate: 'dueDate',
  'finish date': 'dueDate',
  labels: 'tags',
  tag: 'tags',
  notes: 'description',
  details: 'description',
  description: 'description',
  'task content': 'description',
  'card description': 'description',
  parent: 'parentId',
  'parent task id': 'parentId',
  'parent id': 'parentId',
  start: 'startDate',
  created: 'dateCreated',
  'created at': 'dateCreated',
  'created date': 'dateCreated',
  'time estimate': 'timeEstimate',
  estimate: 'timeEstimate',
  'time tracked': 'timeTracked',
  'time logged': 'timeTracked',
  subtasks: 'subtaskNames',
  checklist: 'checklist',
  type: 'taskType',
  'issue type': 'taskType',
  section: 'list',
  'section/column': 'list',
  'list name': 'list',
  group: 'list',
}

const BY_LABEL = new Map(TASK_COLUMNS.map((c) => [normaliseHeader(c.label), c.key]))

export type MappingMemory = Record<string, string>

export function autoMap(
  headers: string[],
  opts: {
    memory?: MappingMemory
    customFields?: Array<{ id: string; name: string }>
    /** An app's own column names (`CSV_SOURCES[app].columns`), ahead of the generic ones. */
    columns?: Record<string, AutoMapTarget>
  } = {},
): Record<string, AutoMapTarget> {
  const fieldByName = new Map((opts.customFields ?? []).map((f) => [normaliseHeader(f.name), f.id]))
  const fieldIds = new Set((opts.customFields ?? []).map((f) => f.id))
  const taken = new Set<string>()
  const out: Record<string, AutoMapTarget> = {}
  for (const header of headers) {
    const key = normaliseHeader(header)
    const remembered = opts.memory?.[key]
    let target: AutoMapTarget | undefined
    if (remembered && (!remembered.startsWith('cf:') || remembered === 'cf:new' || fieldIds.has(remembered.slice(3)))) {
      target = remembered as AutoMapTarget
    }
    target ??= opts.columns?.[key] ?? BY_LABEL.get(key) ?? CLICKUP_EXPORT[key] ?? SYNONYMS[key]
    if (!target && fieldByName.has(key)) target = `cf:${fieldByName.get(key)}`
    target ??= 'skip'
    // One incoming field per target: a second "Name" column stays unmapped
    // rather than silently replacing the first.
    if (target !== 'skip' && target !== 'cf:new') {
      if (taken.has(target)) target = 'skip'
      else taken.add(target)
    }
    out[header] = target
  }
  return out
}

/** The mapping the grid works with: Parent ID resolved away (see `applyParentIds`). */
export function gridMapping(mapping: Record<string, AutoMapTarget>): ColumnMapping {
  const out: ColumnMapping = {}
  for (const [h, t] of Object.entries(mapping)) out[h] = t === 'parentId' ? 'skip' : t
  return out
}
