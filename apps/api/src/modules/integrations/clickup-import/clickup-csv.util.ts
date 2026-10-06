/**
 * Pure ClickUp-CSV helpers (no DB). Kept separate from the service so the
 * parsing, custom-field detection, type inference, and duplicate-key logic are
 * unit-testable in isolation (Plan §12.5).
 */

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

/** Rundesk custom-field types we can infer from a ClickUp CSV column. */
export type InferredFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox'

export type ParsedTask = {
  taskId?: string
  parentId?: string
  title: string
  description?: string
  status?: string
  priority?: string
  dueDate?: string
  list?: string
  folder?: string
  assignees?: string
  tags?: string
  /** Raw custom-field cells keyed by the original-case column header. */
  custom: Record<string, string>
}

export type CustomFieldColumn = {
  /** Header as shown in the CSV (original case) — used as the field name. */
  name: string
  type: InferredFieldType
  /** Present only for `type === 'dropdown'`. */
  options?: Array<{ label: string; value: string }>
}

/** Which of the fields a merge would reset the file carries a column for. */
export type CsvCarries = { status: boolean; priority: boolean }

export type ParsedCsv = {
  rows: ParsedTask[]
  headers: string[]
  customFieldColumns: CustomFieldColumn[]
  /** Read by the merge (`mergeSetOf`): a column the file lacks is not a value to write. */
  carries: CsvCarries
}

/**
 * Standard ClickUp export columns (normalised lower/trim). Anything NOT in this
 * set is treated as a user custom-field column. Kept deliberately inclusive so
 * we don't misread a built-in column (e.g. "Date Created") as a custom field.
 */
const KNOWN_COLUMNS = new Set<string>([
  // mapped task fields
  'task id', 'id', 'task name', 'name', 'task content', 'content', 'description', 'text',
  'status', 'priority', 'due date', 'due date text', 'list', 'list name', 'folder', 'folder name',
  'assignee', 'assignees', 'tags', 'tag', 'parent', 'parent id', 'parent task id',
  // other built-in export columns we intentionally skip (not custom fields)
  'space', 'space name', 'start date', 'start date text', 'date created', 'date created text',
  'created date', 'date closed', 'date closed text', 'date done', 'date done text', 'date updated',
  'updated date', 'created by', 'comment count', 'comments', 'attachments', 'attachment', 'checklists',
  'checklist', 'subtask ids', 'subtasks', 'linked tasks', 'time estimate', 'time estimated',
  'time estimate text', 'time spent', 'time tracked', 'time logged', 'watchers', 'followers',
  'task url', 'url', 'email', 'sprints', 'sprint', 'lists',
])

const normalizeHeader = (h: string): string => h.trim().toLowerCase()

const BOOL_TRUE = new Set(['true', 'yes', 'checked', 'done', '1', '✓', 'x'])
const BOOL_FALSE = new Set(['false', 'no', 'unchecked', 'not checked', '0', '✗', ''])
const BOOL_TOKENS = new Set([...BOOL_TRUE, ...BOOL_FALSE].filter((t) => t !== ''))

/** Split a ClickUp multi-value cell (comma / newline / semicolon separated). */
export function splitList(value?: string): string[] {
  if (!value) return []
  return value
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Duplicate key: a task is "the same" within a list when its title matches. */
export function dupKey(listName: string, title: string): string {
  // The separator is a NUL, written as an ESCAPE. It was a raw 0x00 byte in this
  // file, which makes every text tool treat the whole source as binary: `grep`
  // prints "binary file matches" and skips it, so a search for anything in here
  // comes back empty rather than wrong. The key is byte-identical either way.
  return `${listName.trim().toLowerCase()}\u0000${title.trim().toLowerCase()}`
}

// ── ClickUp value → Rundesk mapping ──────────────────────────────────────────
export function mapStatus(value?: string): TaskStatus {
  if (!value) return 'todo'
  const v = value.toLowerCase().trim()
  if (v.includes('done') || v.includes('complete') || v.includes('closed')) return 'done'
  if (v.includes('progress') || v === 'doing') return 'in_progress'
  if (v.includes('review')) return 'in_review'
  if (v.includes('cancel')) return 'cancelled'
  if (v.includes('backlog') || v.includes('open')) return 'backlog'
  return 'todo'
}

/**
 * A priority column's value, mapped to ours.
 *
 * EXACT MATCHES FIRST, because substring order was deciding the answer.
 * `v.includes('high')` ran before anything could look at `highest`, so
 * "Highest" — the tier ABOVE high — imported as `high`, and `lowest` was
 * unreachable for the same reason. Neither word is in ClickUp's own
 * vocabulary (Urgent / High / Normal / Low), which is why it went unnoticed;
 * but this function is also fed the generic spreadsheet importer's columns,
 * and "Highest"/"Lowest" are ordinary words in a sheet somebody exported from
 * somewhere else.
 *
 * The numeric forms are ClickUp's own: 1 urgent, 2 high, 3 normal, 4 low.
 */
const PRIORITY_BY_WORD: Record<string, TaskPriority> = {
  urgent: 'urgent', highest: 'urgent', critical: 'urgent', blocker: 'urgent', p0: 'urgent', '1': 'urgent',
  high: 'high', p1: 'high', '2': 'high',
  normal: 'normal', medium: 'normal', none: 'normal', p2: 'normal', '3': 'normal',
  low: 'low', lowest: 'low', minor: 'low', p3: 'low', '4': 'low',
}

export function mapPriority(value?: string): TaskPriority {
  if (!value) return 'normal'
  const v = value.toLowerCase().trim()
  const exact = PRIORITY_BY_WORD[v]
  if (exact) return exact
  // Only then fall back to containment, most specific word first so a longer
  // word can never be eaten by the shorter one inside it.
  if (v.includes('highest')) return 'urgent'
  if (v.includes('lowest')) return 'low'
  if (v.includes('urgent') || v.includes('critical')) return 'urgent'
  if (v.includes('high')) return 'high'
  if (v.includes('low')) return 'low'
  return 'normal'
}

export function safeDate(value: string): Date | undefined {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return undefined
  return new Date(ms)
}

// ── Custom-field type inference ──────────────────────────────────────────────

const isPlainNumber = (v: string): boolean => v.trim() !== '' && Number.isFinite(Number(v))

/**
 * Infer a Rundesk custom-field type from the observed column values.
 * Order: checkbox → number → date → dropdown → text (default).
 */
export function inferCustomFieldType(values: string[]): CustomFieldColumn['type'] {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== '')
  if (nonEmpty.length === 0) return 'text'

  // checkbox: every value is a recognised boolean token
  if (nonEmpty.every((v) => BOOL_TOKENS.has(v.toLowerCase()))) return 'checkbox'

  // number: every value is a finite number
  if (nonEmpty.every(isPlainNumber)) return 'number'

  // date: no value is a plain number, and every value is Date.parse-able
  if (nonEmpty.every((v) => !isPlainNumber(v) && !Number.isNaN(Date.parse(v)))) return 'date'

  // dropdown: low-cardinality with real repetition and short label-like values
  // (a bounded enum, not free-form text). Number/date/checkbox are ruled out
  // above, so by here every value is a non-numeric string.
  const distinct = new Set(nonEmpty.map((v) => v.toLowerCase()))
  const maxLen = Math.max(...nonEmpty.map((v) => v.length))
  if (
    distinct.size >= 1 &&
    distinct.size <= 20 &&
    distinct.size < nonEmpty.length && // at least one value repeats
    maxLen <= 64
  ) {
    return 'dropdown'
  }

  return 'text'
}

/** Build de-duplicated dropdown options (first-seen casing wins). */
export function buildDropdownOptions(values: string[]): Array<{ label: string; value: string }> {
  const seen = new Map<string, string>()
  for (const raw of values) {
    const v = raw.trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (!seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()].map((v) => ({ label: v, value: v }))
}

/**
 * Coerce a raw CSV cell into the stored value shape for a given field type.
 * Returns null when the cell can't be represented (skip the value, not an error).
 */
export function coerceCustomValue(
  type: InferredFieldType,
  raw: string,
): string | number | boolean | null {
  const v = raw.trim()
  if (v === '') return null
  switch (type) {
    case 'checkbox': {
      const lower = v.toLowerCase()
      if (BOOL_TRUE.has(lower)) return true
      if (BOOL_FALSE.has(lower)) return false
      return null
    }
    case 'number': {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    case 'date': {
      const ms = Date.parse(v)
      return Number.isNaN(ms) ? null : new Date(ms).toISOString()
    }
    case 'dropdown':
    case 'text':
    default:
      return v
  }
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

/** Split CSV text into logical rows, respecting quoted newlines. */
export function splitCsvLines(csv: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i]
    if (ch === '"') {
      if (inQuote && csv[i + 1] === '"') {
        current += '""'
        i++
        continue
      }
      inQuote = !inQuote
      current += ch
      continue
    }
    if (ch === '\n' && !inQuote) {
      lines.push(current.replace(/\r$/, ''))
      current = ''
      continue
    }
    current += ch
  }
  if (current.length > 0) lines.push(current.replace(/\r$/, ''))
  return lines.filter((l) => l.trim().length > 0)
}

/** Split a single CSV row into fields, respecting quotes. */
export function splitCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i++
        continue
      }
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      fields.push(current)
      current = ''
      continue
    }
    current += ch
  }
  fields.push(current)
  return fields
}

/**
 * Parse a ClickUp CSV export into task rows plus the detected custom-field
 * columns (with inferred types + dropdown options). Columns beyond the known
 * task/built-in fields become custom fields.
 */
export function parseClickUpCsv(csv: string): ParsedCsv {
  const lines = splitCsvLines(csv)
  if (lines.length < 2) return { rows: [], headers: [], customFieldColumns: [], carries: { status: false, priority: false } }

  const rawHeaders = splitCsvRow(lines[0]).map((h) => h.trim())
  const headers = rawHeaders.map(normalizeHeader)
  const idx = (name: string) => headers.findIndex((h) => h === name.toLowerCase())

  const tIdx = idx('task name') !== -1 ? idx('task name') : idx('name')
  const dIdx = idx('description') !== -1 ? idx('description') : idx('task content')
  const sIdx = idx('status')
  const pIdx = idx('priority')
  const duIdx = idx('due date')
  const lIdx = idx('list') !== -1 ? idx('list') : idx('list name')
  const fIdx = idx('folder') !== -1 ? idx('folder') : idx('folder name')
  const aIdx = idx('assignee') !== -1 ? idx('assignee') : idx('assignees')
  const tagIdx = idx('tags')
  const idIdx = idx('task id') !== -1 ? idx('task id') : idx('id')
  const parentIdx =
    idx('parent id') !== -1 ? idx('parent id') : idx('parent') !== -1 ? idx('parent') : idx('parent task id')

  // Custom-field columns: any header not in the known set and not empty.
  const customCols = rawHeaders
    .map((name, i) => ({ name, i, key: headers[i] }))
    .filter((c) => c.key !== '' && !KNOWN_COLUMNS.has(c.key))

  // First pass: collect rows + per-custom-column values for type inference.
  const rows: ParsedTask[] = []
  const columnValues = new Map<number, string[]>()
  for (const c of customCols) columnValues.set(c.i, [])

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i])
    if (!cols.length) continue
    const title = (tIdx !== -1 ? cols[tIdx] : '')?.trim() ?? ''
    if (!title) continue

    const custom: Record<string, string> = {}
    for (const c of customCols) {
      const cell = (cols[c.i] ?? '').trim()
      columnValues.get(c.i)!.push(cell)
      if (cell) custom[c.name] = cell
    }

    rows.push({
      taskId: idIdx !== -1 ? cols[idIdx]?.trim() || undefined : undefined,
      parentId: parentIdx !== -1 ? cols[parentIdx]?.trim() || undefined : undefined,
      title,
      description: dIdx !== -1 ? cols[dIdx]?.trim() : undefined,
      status: sIdx !== -1 ? cols[sIdx]?.trim() : undefined,
      priority: pIdx !== -1 ? cols[pIdx]?.trim() : undefined,
      dueDate: duIdx !== -1 ? cols[duIdx]?.trim() : undefined,
      list: lIdx !== -1 ? cols[lIdx]?.trim() : undefined,
      folder: fIdx !== -1 ? cols[fIdx]?.trim() : undefined,
      assignees: aIdx !== -1 ? cols[aIdx]?.trim() : undefined,
      tags: tagIdx !== -1 ? cols[tagIdx]?.trim() : undefined,
      custom,
    })
  }

  const customFieldColumns: CustomFieldColumn[] = customCols.map((c) => {
    const values = columnValues.get(c.i) ?? []
    const type = inferCustomFieldType(values)
    return type === 'dropdown'
      ? { name: c.name, type, options: buildDropdownOptions(values) }
      : { name: c.name, type }
  })

  return { rows, headers: rawHeaders, customFieldColumns, carries: { status: sIdx !== -1, priority: pIdx !== -1 } }
}

/**
 * WHAT A MERGE WRITES: THE COLUMNS THE FILE CARRIES, AND NO OTHER
 * (`found-5-oct/import-merge-resets-fields-the-file-lacks`, measured here as
 * on the spreadsheet import). The merge wrote `mapStatus(t.status)` and
 * `mapPriority(t.priority)` from every row, and a file with no Status or
 * Priority column carries neither — so a matched task In progress and High
 * came out To do and Normal. Status and priority are written when the file
 * has their column; the description and the due date exactly as before: the
 * description whenever the file has a Description column — an empty cell
 * writes an empty description, as it did — and the due date when its cell
 * holds one. (What an empty cell in a column the file does carry should
 * write is the owner's to settle, for this importer and the spreadsheet one.)
 */
export function mergeSetOf(t: ParsedTask, carries: CsvCarries): {
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: Date
} {
  return {
    description: t.description ?? undefined,
    ...(carries.status ? { status: mapStatus(t.status) } : {}),
    ...(carries.priority ? { priority: mapPriority(t.priority) } : {}),
    dueDate: t.dueDate ? safeDate(t.dueDate) : undefined,
  }
}
