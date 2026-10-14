/**
 * §5.1 — one task as one row of ClickUp's export format. Pure: the job loads
 * the workspace's rows, this lays them out, so the format is tested without a
 * database and cannot drift from the header it is written under.
 */

import {
  attachmentsCell,
  bracketList,
  checklistsCell,
  CLICKUP_EXPORT_HEADERS,
  commentsCell,
  dateCells,
  durationCells,
  priorityWord,
  type ExportDateFormat,
} from '@rundesk/imports'

export type ExportTask = {
  id: string
  title: string
  description: string | null
  status: string
  priority: 'urgent' | 'high' | 'normal' | 'low' | null
  parentTaskId: string | null
  listId: string
  taskTypeId: string | null
  createdAt: Date
  dueDate: Date | null
  startDate: Date | null
  /** Seconds, as RUNDESK stores it. */
  timeEstimate: number | null
}

export type ExportContext = {
  appUrl: string
  workspaceId: string
  dateFormat: ExportDateFormat
  lists: Map<string, { name: string; folderPath: string; spaceName: string; statusNames: Map<string, string> }>
  taskTypes: Map<string, string>
  subtaskIds: Map<string, string[]>
  assignees: Map<string, string[]>
  tags: Map<string, string[]>
  attachments: Map<string, Array<{ title: string; url: string }>>
  checklists: Map<string, Array<{ name: string; items: Array<{ content: string; done: boolean }> }>>
  comments: Map<string, Array<{ author: string; body: string; createdAt: Date; assigned: boolean }>>
  /** Seconds tracked on the task itself. */
  timeSpent: Map<string, number>
  /** One column per Custom Field, after the fixed ones (a RUNDESK extension). */
  fieldColumns: Array<{ id: string; header: string }>
  /** taskId → fieldId → the cell's text. */
  fieldValues: Map<string, Map<string, string>>
}

export function exportHeaders(ctx: Pick<ExportContext, 'fieldColumns'>): string[] {
  return [...CLICKUP_EXPORT_HEADERS, ...ctx.fieldColumns.map((f) => f.header)]
}

export function exportRow(t: ExportTask, ctx: ExportContext): string[] {
  const list = ctx.lists.get(t.listId)
  const [created, createdText] = dateCells(t.createdAt, ctx.dateFormat)
  const [due, dueText] = dateCells(t.dueDate, ctx.dateFormat)
  const [start, startText] = dateCells(t.startDate, ctx.dateFormat)
  const [estimate, estimateText] = durationCells(t.timeEstimate ? t.timeEstimate * 1000 : null)
  const ownSeconds = ctx.timeSpent.get(t.id) ?? 0
  const rolledSeconds = ownSeconds + (ctx.subtaskIds.get(t.id) ?? []).reduce((sum, id) => sum + (ctx.timeSpent.get(id) ?? 0), 0)
  const [spent, spentText] = durationCells(ownSeconds * 1000)
  const [rolled, rolledText] = durationCells(rolledSeconds * 1000)
  const comments = ctx.comments.get(t.id) ?? []
  const values = ctx.fieldValues.get(t.id)
  return [
    t.id,
    `${ctx.appUrl}/app/${ctx.workspaceId}/tasks/${t.id}`,
    (t.taskTypeId && ctx.taskTypes.get(t.taskTypeId)) || '',
    // RUNDESK has no custom task ids.
    '',
    t.title,
    t.description ?? '',
    list?.statusNames.get(t.status) ?? t.status,
    created,
    createdText,
    due,
    dueText,
    start,
    startText,
    t.parentTaskId ?? '',
    bracketList(ctx.subtaskIds.get(t.id) ?? []),
    attachmentsCell(ctx.attachments.get(t.id) ?? []),
    bracketList(ctx.assignees.get(t.id) ?? []),
    bracketList(ctx.tags.get(t.id) ?? []),
    priorityWord(t.priority),
    list?.name ?? '',
    list?.folderPath ?? '',
    list?.spaceName ?? '',
    estimate,
    estimateText,
    checklistsCell(ctx.checklists.get(t.id) ?? []),
    commentsCell(comments),
    String(comments.filter((c) => c.assigned).length),
    spent,
    spentText,
    rolled,
    rolledText,
    ...ctx.fieldColumns.map((f) => values?.get(f.id) ?? ''),
  ]
}

/** A field value as its export cell: an option's label, labels joined by `,`, people by name. */
export function fieldCell(
  type: string,
  stored: unknown,
  options: Array<{ label: string; value: string }>,
  peopleNames: Map<string, string>,
): string {
  const v = (stored as { v?: unknown } | null)?.v
  if (v == null || v === '') return ''
  const label = (x: unknown) => options.find((o) => o.value === x)?.label ?? String(x)
  switch (type) {
    case 'dropdown':
    case 'tshirt_size':
      return label(v)
    case 'labels':
      return Array.isArray(v) ? v.map(label).join(',') : label(v)
    case 'people':
      return Array.isArray(v) ? v.map((id) => peopleNames.get(String(id)) ?? String(id)).join(',') : ''
    case 'files':
    case 'tasks':
      return Array.isArray(v) ? String(v.length) : ''
    default:
      return Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
}

/** Distinct headers for fields that share a name: the second becomes "Name (2)". */
export function fieldHeaders(fields: Array<{ id: string; name: string }>): Array<{ id: string; header: string }> {
  const taken = new Set<string>(CLICKUP_EXPORT_HEADERS.map((h) => h.toLowerCase()))
  return fields.map((f) => {
    let header = f.name
    for (let i = 2; taken.has(header.toLowerCase()); i++) header = `${f.name} (${i})`
    taken.add(header.toLowerCase())
    return { id: f.id, header }
  })
}
