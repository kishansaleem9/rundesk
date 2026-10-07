/**
 * §4 — the apps whose own export is a task-shaped spreadsheet. Each is the
 * Spreadsheet importer with that app's column names pre-mapped and its
 * priority words translated, so "Import from Asana" imports Asana's CSV with
 * no mapping by hand. (Their full connectors — OAuth, users, attachments —
 * are §4's Phase 3; this is what their file exports already allow.)
 *
 * The export instructions shown to the person live in the web catalogue
 * (`ie.app.<key>.*`); the column names here are the ones each app writes.
 */

import type { AutoMapTarget } from './automap'
import type { Priority } from './values'

export const CSV_SOURCE_KEYS = ['asana', 'jira', 'monday', 'notion', 'todoist', 'trello', 'wrike'] as const
export type CsvSourceKey = (typeof CSV_SOURCE_KEYS)[number]

export type CsvSource = {
  key: CsvSourceKey
  /** The product's own name (not translated). */
  label: string
  /** The file its export produces, for the upload step's hint. */
  fileTypes: string
  /** Normalised header → target, consulted before the generic synonyms. */
  columns: Record<string, AutoMapTarget>
  /** Priority cells (lower-case) → RUNDESK priority, as the app writes them. */
  priorities: Record<string, Priority>
}

/** Words several apps use for priority beyond Urgent / High / Normal / Low. */
const COMMON_PRIORITIES: Record<string, Priority> = {
  critical: 'urgent',
  highest: 'urgent',
  medium: 'normal',
  lowest: 'low',
}

export const CSV_SOURCES: Record<CsvSourceKey, CsvSource> = {
  asana: {
    key: 'asana',
    label: 'Asana',
    fileTypes: '.csv',
    columns: {
      'task id': 'taskId',
      name: 'taskName',
      notes: 'description',
      // Asana writes the assignee's name AND email; the email matches exactly.
      'assignee email': 'assignees',
      assignee: 'skip',
      'section/column': 'list',
      'created at': 'dateCreated',
      // "Parent task" holds the parent's NAME, not an id, so it cannot link rows.
      'parent task': 'skip',
    },
    priorities: COMMON_PRIORITIES,
  },
  jira: {
    key: 'jira',
    label: 'Jira',
    fileTypes: '.csv',
    columns: {
      summary: 'taskName',
      'issue id': 'taskId',
      'parent id': 'parentId',
      'issue key': 'skip',
      'issue type': 'taskType',
      created: 'dateCreated',
      'due date': 'dueDate',
      duedate: 'dueDate',
    },
    priorities: { ...COMMON_PRIORITIES, blocker: 'urgent', major: 'high', minor: 'low', trivial: 'low' },
  },
  monday: {
    key: 'monday',
    label: 'Monday',
    fileTypes: '.xlsx',
    columns: {
      name: 'taskName',
      person: 'assignees',
      owner: 'assignees',
      date: 'dueDate',
      timeline: 'skip',
      group: 'list',
      'item id': 'taskId',
    },
    priorities: COMMON_PRIORITIES,
  },
  notion: {
    key: 'notion',
    label: 'Notion',
    fileTypes: '.csv',
    columns: {
      name: 'taskName',
      assign: 'assignees',
      assignee: 'assignees',
      'assigned to': 'assignees',
      date: 'dueDate',
      due: 'dueDate',
      'created time': 'dateCreated',
    },
    priorities: COMMON_PRIORITIES,
  },
  todoist: {
    key: 'todoist',
    label: 'Todoist',
    fileTypes: '.csv',
    columns: {
      content: 'taskName',
      description: 'description',
      responsible: 'assignees',
      date: 'dueDate',
      type: 'skip',
      indent: 'skip',
      author: 'skip',
      date_lang: 'skip',
      'date lang': 'skip',
      timezone: 'skip',
    },
    // Todoist's CSV writes 4 for its top priority (p1) and 1 for none (p4).
    priorities: { '4': 'urgent', '3': 'high', '2': 'normal', '1': 'low' },
  },
  trello: {
    key: 'trello',
    label: 'Trello',
    fileTypes: '.csv',
    columns: {
      'card id': 'taskId',
      'card name': 'taskName',
      'card description': 'description',
      members: 'assignees',
      labels: 'tags',
      // A Trello list is usually a stage of work ("To Do", "Doing", "Done").
      'list name': 'status',
      'card url': 'skip',
      'board name': 'skip',
      'list id': 'skip',
      'board id': 'skip',
    },
    priorities: COMMON_PRIORITIES,
  },
  wrike: {
    key: 'wrike',
    label: 'Wrike',
    fileTypes: '.xlsx',
    columns: {
      title: 'taskName',
      'assigned to': 'assignees',
      assignees: 'assignees',
      'finish date': 'dueDate',
      'created date': 'dateCreated',
    },
    priorities: COMMON_PRIORITIES,
  },
}

export function isCsvSource(key: unknown): key is CsvSourceKey {
  return typeof key === 'string' && (CSV_SOURCE_KEYS as readonly string[]).includes(key)
}
