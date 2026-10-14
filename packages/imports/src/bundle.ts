/**
 * §9.2 — `RundeskImportBundle`, the one intermediate format.
 *
 * Every adapter (spreadsheet today; ClickUp, the RUNDESK archive and the app
 * importers in later phases) turns its source into these records, and one
 * writer turns these records into RUNDESK rows. Source ids are kept so links
 * between records (parent, list, assignee) can be resolved by the writer
 * without the adapter knowing any RUNDESK id.
 */

import type { CustomCellValue, ImportableFieldType } from './custom-fields'
import type { Priority } from './values'

export type BundleUser = { sourceId: string; name?: string; email?: string; avatarUrl?: string }

export type BundleSpace = { sourceId: string; name: string; color?: string }
export type BundleFolder = { sourceId: string; spaceSourceId?: string; name: string }
export type BundleList = { sourceId: string; folderSourceId?: string; spaceSourceId?: string; name: string }

export type BundleStatus = {
  sourceId: string
  listSourceId?: string
  name: string
  color?: string
  category?: 'open' | 'in_progress' | 'closed'
}

export type BundleTaskType = { sourceId: string; name: string }
export type BundleTag = { sourceId: string; name: string; color?: string }

export type BundleCustomField = {
  sourceId: string
  name: string
  type: ImportableFieldType
  /** Map onto an existing field instead of creating one. */
  existingFieldId?: string
  options?: string[]
}

export type BundleComment = { authorSourceId?: string; authorName?: string; body: string; createdAt?: number }
export type BundleAttachment = { title: string; url: string }
export type BundleChecklist = { name: string; items: Array<{ content: string; done: boolean }> }
export type BundleTimeEntry = { userSourceId?: string; durationMs: number; startedAt?: number }
export type BundleRelationship = { targetSourceId: string; type: 'blocks' | 'blocked_by' | 'related_to' }

export type BundleTask = {
  sourceId: string
  /** The file row (spreadsheet) or the source's own reference, for the report. */
  sourceRef?: string
  parentSourceId?: string
  listSourceId?: string
  name: string
  description?: string
  statusName?: string
  priority?: Priority
  dueDate?: number
  startDate?: number
  dateCreated?: number
  timeEstimateMs?: number
  taskTypeName?: string
  tags: string[]
  /** Emails or source user ids, resolved by the writer through the user mapping. */
  assignees: string[]
  /** customField sourceId → value. */
  fields: Record<string, CustomCellValue>
  comments: BundleComment[]
  attachments: BundleAttachment[]
  checklists: BundleChecklist[]
  timeEntries: BundleTimeEntry[]
  relationships: BundleRelationship[]
  /** Name-only subtasks (§2.3 `Subtask Names`). */
  subtaskNames: string[]
}

export type BundleDocPage = { sourceId: string; title: string; markdown: string; children: BundleDocPage[] }
export type BundleDoc = { sourceId: string; title: string; pages: BundleDocPage[] }

export type BundleMessage = { sourceId: string; authorSourceId?: string; text: string; sentAt?: number; threadSourceId?: string }
export type BundleChannel = { sourceId: string; name: string; messages: BundleMessage[] }

export type RundeskImportBundle = {
  users: BundleUser[]
  spaces: BundleSpace[]
  folders: BundleFolder[]
  lists: BundleList[]
  statuses: BundleStatus[]
  taskTypes: BundleTaskType[]
  tags: BundleTag[]
  customFields: BundleCustomField[]
  tasks: BundleTask[]
  docs: BundleDoc[]
  channels: BundleChannel[]
}

export const emptyBundle = (): RundeskImportBundle => ({
  users: [],
  spaces: [],
  folders: [],
  lists: [],
  statuses: [],
  taskTypes: [],
  tags: [],
  customFields: [],
  tasks: [],
  docs: [],
  channels: [],
})

/** §9.1 — every source an import job can name. Only `spreadsheet` has an adapter on the engine so far. */
export const IMPORT_SOURCES = [
  'spreadsheet',
  'document',
  'asana',
  'trello',
  'jira',
  'monday',
  'notion',
  'slack',
  'todoist',
  'wrike',
  'basecamp',
  'confluence',
  'teamwork',
  'clickup_csv',
  'clickup_api',
  'rundesk_archive',
] as const

export type ImportSource = (typeof IMPORT_SOURCES)[number]
