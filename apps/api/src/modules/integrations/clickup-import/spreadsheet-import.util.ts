/**
 * §V2-S13 frame `12:08` — the **Imports** submenu.
 *
 * The frame draws twelve rows under Create › Imports ›:
 *
 *     Spreadsheet files · Document files
 *     Asana · Basecamp · Confluence · Jira Software · Monday · Notion ·
 *     Slack · Todoist · Trello · Wrike
 *
 * Rundesk shipped exactly one importer: a ClickUp CSV reader (plus an optional
 * ClickUp API token for comments/attachments, which is beyond the frames).
 *
 * TEN TILES THAT OPEN A DIALOG THAT CANNOT IMPORT IS THE FACADE DEFECT AT TEN
 * TIMES SCALE. So this file builds ONE real thing — a generic delimited-text
 * importer with an explicit, user-editable column mapping — and then carries
 * per-source **column presets** for the named tools that genuinely publish a
 * task-shaped CSV. A preset is not a separate importer; it is the starting
 * mapping for the same parser, which is why it can be honest.
 *
 * The four sources with no preset are NOT drawn as controls anywhere. They are
 * listed once, as text, with the reason — see `UNSUPPORTED_SOURCES`. Absent
 * beats fake.
 */

import { cellHasTime, splitCsvLines, mapStatus, mapPriority, type TaskPriority, type TaskStatus } from './clickup-csv.util'

/** Which Rundesk task field a spreadsheet column feeds. `ignore` = not imported. */
export type SheetField =
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'assignees'
  | 'list'
  | 'tags'
  | 'ignore'

/** Every field the mapper offers, in the order the UI draws them. ONE list. */
export const SHEET_FIELDS: readonly SheetField[] = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'startDate',
  'assignees',
  'list',
  'tags',
  'ignore',
] as const

/** header (as written in the file) → field. */
export type ColumnMapping = Record<string, SheetField>

export type SheetDelimiter = ',' | '\t' | ';' | '|'

/**
 * How a source spells numeric priorities.
 *  - `clickup`  1 = urgent … 4 = low (also ClickUp, Asana numeric exports)
 *  - `todoist`  4 = urgent … 1 = low — Todoist's CSV inverts the UI's p1..p4
 *  - `text`     no numeric meaning; only words are honoured
 */
export type PriorityScale = 'clickup' | 'todoist' | 'text'

export type SheetSource = {
  key: string
  /** How the frame spells it, so the UI and the audit can be compared directly. */
  label: string
  /** Lower-cased source header → field. */
  columns: Record<string, SheetField>
  priorityScale: PriorityScale
  /** Where the export comes from, shown under the picker so it is actionable. */
  exportHint: string
}

/**
 * The named sources whose export is a task-shaped delimited file. Each one is
 * a mapping over the SAME parser — nothing here is a separate code path, which
 * is the only reason seven names can be honest at once.
 *
 * Header spellings are the ones the product's own export writes. Unknown
 * headers are not an error: they simply start on `ignore` and the person can
 * map them by hand.
 */
export const SHEET_SOURCES: readonly SheetSource[] = [
  {
    key: 'generic',
    label: 'Spreadsheet files',
    priorityScale: 'clickup',
    exportHint: 'Any CSV or TSV with a header row. Map the columns yourself.',
    columns: {
      title: 'title',
      name: 'title',
      task: 'title',
      'task name': 'title',
      description: 'description',
      notes: 'description',
      status: 'status',
      priority: 'priority',
      'due date': 'dueDate',
      due: 'dueDate',
      'start date': 'startDate',
      assignee: 'assignees',
      assignees: 'assignees',
      owner: 'assignees',
      list: 'list',
      section: 'list',
      tags: 'tags',
      labels: 'tags',
    },
  },
  {
    key: 'asana',
    label: 'Asana',
    priorityScale: 'text',
    exportHint: 'Asana › Project ▾ › Export/Print › CSV.',
    columns: {
      name: 'title',
      notes: 'description',
      'assignee email': 'assignees',
      assignee: 'assignees',
      'due date': 'dueDate',
      'start date': 'startDate',
      'section/column': 'list',
      tags: 'tags',
      priority: 'priority',
    },
  },
  {
    key: 'jira',
    label: 'Jira Software',
    priorityScale: 'text',
    exportHint: 'Jira › Issue search › Export ▾ › CSV (all fields).',
    columns: {
      summary: 'title',
      description: 'description',
      status: 'status',
      priority: 'priority',
      'due date': 'dueDate',
      duedate: 'dueDate',
      assignee: 'assignees',
      'project name': 'list',
    },
  },
  {
    key: 'monday',
    label: 'Monday',
    priorityScale: 'text',
    exportHint: 'monday.com › Board menu › Export board to Excel, then save as CSV.',
    columns: {
      name: 'title',
      notes: 'description',
      person: 'assignees',
      owner: 'assignees',
      status: 'status',
      date: 'dueDate',
      'due date': 'dueDate',
      timeline: 'ignore',
      priority: 'priority',
      group: 'list',
    },
  },
  {
    key: 'notion',
    label: 'Notion',
    priorityScale: 'text',
    exportHint: 'Notion › database ••• › Export › Markdown & CSV.',
    columns: {
      name: 'title',
      description: 'description',
      status: 'status',
      assignee: 'assignees',
      'assigned to': 'assignees',
      due: 'dueDate',
      'due date': 'dueDate',
      priority: 'priority',
      tags: 'tags',
    },
  },
  {
    key: 'todoist',
    label: 'Todoist',
    // Todoist's CSV writes 4 for p1 and 1 for p4 — the inverse of ClickUp's.
    priorityScale: 'todoist',
    exportHint: 'Todoist › project ••• › Export › Export as a template (CSV).',
    columns: {
      content: 'title',
      description: 'description',
      priority: 'priority',
      responsible: 'assignees',
      date: 'dueDate',
      type: 'ignore',
      indent: 'ignore',
      author: 'ignore',
    },
  },
  {
    key: 'trello',
    label: 'Trello',
    priorityScale: 'text',
    exportHint: 'Trello › Board menu › Print, export and share › Export as CSV.',
    columns: {
      'card name': 'title',
      'card description': 'description',
      'due date': 'dueDate',
      members: 'assignees',
      labels: 'tags',
      'list name': 'list',
      'board name': 'ignore',
      'card url': 'ignore',
    },
  },
  {
    key: 'wrike',
    label: 'Wrike',
    priorityScale: 'text',
    exportHint: 'Wrike › folder ▾ › Export to Excel, then save as CSV.',
    columns: {
      title: 'title',
      description: 'description',
      status: 'status',
      'assigned to': 'assignees',
      'start date': 'startDate',
      'due date': 'dueDate',
      'finish date': 'dueDate',
      priority: 'priority',
    },
  },
] as const

/**
 * The frame's remaining rows, recorded as DECISIONS rather than quietly
 * dropped — and deliberately not rendered as anything clickable.
 *
 * Re-check these before trusting them (a reason that stopped being true is its
 * own defect class). Each one is "there is no task-shaped export to parse",
 * not "we ran out of time".
 */
export const UNSUPPORTED_SOURCES: ReadonlyArray<{ key: string; label: string; reason: string }> = [
  {
    key: 'basecamp',
    label: 'Basecamp',
    reason:
      'Basecamp has no built-in export of to-dos; reading them needs the Basecamp API and an OAuth app, which is a different build from a file importer.',
  },
  {
    key: 'confluence',
    label: 'Confluence',
    reason:
      'Confluence exports pages as HTML/XML/PDF, not task rows. Importing it means a document importer writing Docs, not tasks.',
  },
  {
    key: 'slack',
    label: 'Slack',
    reason:
      'A Slack export is conversation JSON. There are no task rows in it to map.',
  },
  {
    key: 'documents',
    label: 'Document files',
    /*
     * THIS REASON WAS TRUE AND STOPPED BEING TRUE, which is worse than a
     * missing one: it said "no document parser is built, so no control is
     * drawn for it" and a parser was then built, so the sentence kept
     * explaining an absence that had been filled. A person reading it would
     * have gone looking for a feature that is one tab away.
     *
     * The row stays in THIS list because it is still not a spreadsheet preset —
     * it writes Docs rather than task rows, which is the whole reason it needs
     * its own tab — and the sentence now points at that tab instead of
     * apologising for it.
     */
    reason:
      'Document import writes Rundesk Docs, not task rows, so it is not a spreadsheet preset. It has its own tab above, which reads Markdown and plain text.',
  },
] as const

export const sourceByKey = (key?: string): SheetSource =>
  SHEET_SOURCES.find((s) => s.key === key) ?? SHEET_SOURCES[0]

// ── what is read at all ──────────────────────────────────────────────────────

/**
 * The files this importer reads: delimited text. No XLSX parser ships in this
 * repo (reading one is the feature `ledger-rows/row-816`), so the page asks
 * for a CSV rather than accepting an .xlsx it would then fail to read.
 */
export const ACCEPTED_SHEET_EXTENSIONS = ['.csv', '.tsv', '.txt'] as const

/**
 * A FILE THAT IS NOT DELIMITED TEXT IS REFUSED IN THE PAGE'S OWN WORDS
 * (`found-5-oct/xlsx-read-as-text`): its `import.sheetAccepted` and
 * `import.sheetNoXlsx`, run together as the page shows them under the picker.
 * An .xlsx put in anyway (the picker's "All files", a drop) was read as text,
 * its zip's bytes drawn as one column name, offered for import, and the run
 * failed on them — leaving an empty space, project and list behind.
 */
export const NOT_DELIMITED_TEXT = `Accepted: ${ACCEPTED_SHEET_EXTENSIONS.join(' · ')}. .xlsx is not read — re-save the sheet as CSV first.`

/**
 * A ZIP, BY ITS FIRST BYTES: "PK" and one of its three signatures (a file's
 * local header 03 04, an empty archive's 05 06, a spanned one's 07 08). An
 * .xlsx, an .ods and a .numbers are all zips. The route receives the file's
 * content only, read as text by the page — the zip's first four bytes are
 * ASCII control characters and survive that reading unchanged. "PK" alone is
 * not the test: a sheet whose first column is named "PK" is a CSV.
 *
 * What is not a string is no zip: the body is whatever a client sent, and a
 * number or an object goes on to `parseSheet`, which finds no header row in
 * it (400), as it did before this was asked — it answered 500 here.
 */
export function isZipContent(content: unknown): boolean {
  if (typeof content !== 'string') return false
  const head = content
  if (head.length < 4 || !head.startsWith('PK')) return false
  const pair = (head.charCodeAt(2) << 8) | head.charCodeAt(3)
  return pair === 0x0304 || pair === 0x0506 || pair === 0x0708
}

/**
 * A NUL IN THE FIRST LINE: NOT DELIMITED TEXT EITHER. A header row never holds
 * one, and a binary file does within its first bytes — a legacy .xls (an OLE2
 * compound file: D0 CF 11 E0 A1 B1 1A E1, then NULs) is no zip, and read as
 * text by the page it reached the preview as five columns of binary, was
 * offered for import, and failed (measured on lane 4). Only the first line is
 * asked: a NUL in a later row is that row's own, and it fails alone.
 */
export function headerHoldsNul(content: unknown): boolean {
  if (typeof content !== 'string') return false
  const ends = [content.indexOf('\n'), content.indexOf('\r')].filter((i) => i !== -1)
  const head = ends.length ? content.slice(0, Math.min(...ends)) : content
  return head.includes('\u0000')
}

/**
 * WHAT IS WRITTEN TO THE JOB ROW, WITHOUT A NUL: Postgres refuses U+0000 in
 * text and in jsonb ("unsupported Unicode escape sequence"). A row's error
 * names its title and a refused row names its value, so one NUL in one cell
 * reached the job's `result` and the whole run failed on its last write, in
 * those raw words (`found-5-oct/xlsx-read-as-text`) — where that row should
 * fail alone, as any other row the database refuses does. Each NUL is
 * written as U+FFFD, the character that says one stood there.
 */
export function storable<T>(value: T): T {
  if (typeof value === 'string') return value.split('\u0000').join('\uFFFD') as T
  if (Array.isArray(value)) return value.map((v) => storable(v)) as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, storable(v)])) as T
  }
  return value
}

// ── parsing ──────────────────────────────────────────────────────────────────

const DELIMITERS: SheetDelimiter[] = [',', '\t', ';', '|']

/**
 * Pick the delimiter from the header line: the candidate that appears most
 * often OUTSIDE quotes. A comma-quoted TSV header ("a,b"\tc) is why the count
 * has to respect quoting rather than just counting characters.
 */
export function detectDelimiter(text: string): SheetDelimiter {
  const [header = ''] = splitCsvLines(text)
  let best: SheetDelimiter = ','
  let bestCount = 0
  for (const d of DELIMITERS) {
    let count = 0
    let inQuote = false
    for (let i = 0; i < header.length; i++) {
      const ch = header[i]
      if (ch === '"') {
        if (inQuote && header[i + 1] === '"') { i++; continue }
        inQuote = !inQuote
        continue
      }
      if (ch === d && !inQuote) count++
    }
    if (count > bestCount) { best = d; bestCount = count }
  }
  return best
}

/**
 * Split one row on `delim`, honouring quotes and doubled quotes. The
 * delimiter-aware generalisation of `splitCsvRow` in `clickup-csv.util.ts`
 * (which is comma-only and stays that way so the ClickUp path is untouched).
 */
export function splitDelimitedRow(line: string, delim: SheetDelimiter): string[] {
  const fields: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; continue }
      inQuote = !inQuote
      continue
    }
    if (ch === delim && !inQuote) { fields.push(current); current = ''; continue }
    current += ch
  }
  fields.push(current)
  return fields
}

export type SheetTable = {
  headers: string[]
  delimiter: SheetDelimiter
  /** One entry per data row: its cells, and the 1-based LINE number in the file. */
  rows: Array<{ line: number; cells: string[] }>
}

/** Split a delimited file into a header row plus numbered data rows. */
export function parseSheet(text: string, delimiter?: SheetDelimiter): SheetTable {
  const delim = delimiter ?? detectDelimiter(text)
  const lines = splitCsvLines(text ?? '')
  if (lines.length === 0) return { headers: [], delimiter: delim, rows: [] }
  const headers = splitDelimitedRow(lines[0], delim).map((h) => h.trim())
  const rows = lines.slice(1).map((line, i) => ({
    // +2: line 1 is the header, and `i` is 0-based within the remainder.
    line: i + 2,
    cells: splitDelimitedRow(line, delim),
  }))
  return { headers, delimiter: delim, rows }
}

/**
 * Starting mapping for a set of headers under a preset. Falls back to the
 * generic preset for any header the named source does not know, so a Trello
 * export with an extra "Story points" column still maps the six it does know.
 */
export function autoMap(headers: string[], sourceKey?: string): ColumnMapping {
  const source = sourceByKey(sourceKey)
  const generic = SHEET_SOURCES[0]
  const mapping: ColumnMapping = {}
  let titleTaken = false
  for (const h of headers) {
    const key = h.trim().toLowerCase()
    const field = source.columns[key] ?? (source.key === 'generic' ? undefined : generic.columns[key]) ?? 'ignore'
    // Exactly one column may be the title; a second "Name" stays unmapped
    // rather than silently overwriting the first.
    if (field === 'title') {
      mapping[h] = titleTaken ? 'ignore' : 'title'
      titleTaken = true
      continue
    }
    mapping[h] = field
  }
  return mapping
}

// ── value mapping ────────────────────────────────────────────────────────────

/**
 * Status buckets for the six default list statuses. This MIRRORS
 * `DEFAULT_LIST_STATUSES` in `apps/api/src/modules/lists/lists.service.ts`,
 * which is not exported; the importer seeds its own lists from this constant,
 * so the pipeline it creates and the category it stamps cannot disagree with
 * each other. `spreadsheet-import.util.test.ts` pins the six pairs.
 */
export const DEFAULT_STATUSES = [
  { key: 'backlog',     name: 'Backlog',     color: '#94a3b8', category: 'open' as const,        position: 0 },
  { key: 'todo',        name: 'To do',       color: '#64748b', category: 'open' as const,        position: 1 },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' as const, position: 2 },
  { key: 'in_review',   name: 'In review',   color: '#a855f7', category: 'in_progress' as const, position: 3 },
  { key: 'done',        name: 'Done',        color: '#10b981', category: 'closed' as const,      position: 4 },
  { key: 'cancelled',   name: 'Cancelled',   color: '#f43f5e', category: 'closed' as const,      position: 5 },
] as const

export type StatusCategory = 'open' | 'in_progress' | 'closed'

/**
 * The bucket a status key belongs to. `tasks.status_category` is what every
 * rollup, the Closed toggle and the progress ring read — the ClickUp importer
 * never sets it, so an imported "Done" task counts as open everywhere. This is
 * the reader that stops that happening here.
 */
export function statusCategoryOf(status: TaskStatus): StatusCategory {
  return DEFAULT_STATUSES.find((s) => s.key === status)?.category ?? 'open'
}

/*
 * Extra words the general ClickUp mapper does not know (Jira, Wrike, Monday) —
 * and ONLY those, which is the correction.
 *
 * These lists held `highest`, `urgent`, `critical` and `lowest` as well, every
 * one of which `mapPriority` already answers: its own table maps them exactly
 * and its containment rules try `highest` and `lowest` BEFORE `high` and `low`
 * so a longer word cannot be eaten by the shorter one inside it. Four entries
 * that decided nothing — the duplicated list, in the function whose doc comment
 * says it delegates the common vocabulary precisely so the two cannot drift.
 *
 * It cost a break patch. `imports-9-priorityscale` emptied `URGENT_WORDS` to
 * make Jira's "Highest" import as high, and ran GREEN: `mapPriority` caught it
 * twice over, so the check could not see the change.
 *
 * What stays is what `mapPriority` genuinely cannot express. Its table is an
 * EXACT match, so `blocker`, `immediate`, `minor`, `trivial` and `deferred`
 * still need a containment pass here — "Blocker - P1" hits no exact key, and
 * none of `mapPriority`'s containment rules mention it.
 */
const URGENT_WORDS = ['blocker', 'immediate']
const LOW_WORDS = ['minor', 'trivial', 'deferred']

/**
 * Normalise a priority cell. Delegates the common vocabulary to
 * `mapPriority` (clickup-csv.util) so the two cannot drift; only the tokens
 * that mapper cannot express are handled here.
 */
export function normalizePriority(raw: string | undefined, scale: PriorityScale): TaskPriority {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v) return 'normal'

  if (/^[0-9]+$/.test(v)) {
    const n = Number(v)
    if (scale === 'text') return 'normal'
    if (scale === 'todoist') {
      // Todoist CSV: 4 = p1 (urgent) … 1 = p4 (low).
      if (n >= 4) return 'urgent'
      if (n === 3) return 'high'
      if (n === 2) return 'normal'
      return 'low'
    }
    return mapPriority(v) // clickup: 1 urgent, 2 high, 4 low
  }

  if (URGENT_WORDS.some((w) => v.includes(w))) return 'urgent'
  // These two run before `mapPriority` because they are words it has no rule
  // for at all, not because they have to beat its rules. The comment here used
  // to say `"lowest"/"minor" must beat mapPriority's substring rules, which
  // would read "highest" as high and never see "lowest" at all` — a stale
  // reason: `mapPriority` orders `highest` and `lowest` ahead of `high` and
  // `low` for exactly that reason, and says so in its own comment.
  if (LOW_WORDS.some((w) => v.includes(w))) return 'low'
  return mapPriority(v)
}

export { mapStatus }

// ── row validation ───────────────────────────────────────────────────────────

export type RejectCode = 'title_missing' | 'title_too_long' | 'invalid_date' | 'ragged_row'

export type RowRejection = {
  /** 1-based line number in the uploaded file (line 1 is the header). */
  row: number
  code: RejectCode
  /** Human sentence naming the row and what was wrong with it. */
  message: string
  column?: string
  value?: string
}

export type MappedRow = {
  row: number
  title: string
  description?: string
  status: TaskStatus
  statusCategory: StatusCategory
  priority: TaskPriority
  dueDate?: Date
  startDate?: Date
  /** Whether each date's cell held a time of day, not only a day (`cellHasTime`). */
  dueDateHasTime: boolean
  startDateHasTime: boolean
  assignees: string[]
  listName: string
  tags: string[]
}

export const MAX_TITLE = 500
export const DEFAULT_LIST_NAME = 'Imported Tasks'

/** Multi-value cell → trimmed parts. Commas, semicolons and newlines. */
export function splitCell(value?: string): string[] {
  if (!value) return []
  return value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
}

/**
 * Turn one parsed line into a task, or say why it cannot become one.
 *
 * Every rejection carries the FILE LINE NUMBER and the offending column, so
 * "row 7: due date “tomorrow?” is not a date" is something a person can go and
 * fix. A row that is rejected is never written — half-importing it and
 * reporting success is the failure this whole audit is about.
 */
export function mapRow(
  entry: { line: number; cells: string[] },
  headers: string[],
  mapping: ColumnMapping,
  opts: { priorityScale: PriorityScale; defaultListName?: string },
): { ok: true; row: MappedRow } | { ok: false; rejection: RowRejection } {
  const { line, cells } = entry

  if (cells.length > headers.length) {
    return {
      ok: false,
      rejection: {
        row: line,
        code: 'ragged_row',
        message: `Row ${line}: ${cells.length} values for ${headers.length} columns — the row is misquoted or has a stray delimiter.`,
        value: String(cells.length),
      },
    }
  }

  const pick = (field: SheetField): { header: string; value: string } | undefined => {
    for (let i = 0; i < headers.length; i++) {
      if (mapping[headers[i]] === field) {
        return { header: headers[i], value: (cells[i] ?? '').trim() }
      }
    }
    return undefined
  }

  const titleCell = pick('title')
  const title = titleCell?.value ?? ''
  if (!title) {
    return {
      ok: false,
      rejection: {
        row: line,
        code: 'title_missing',
        column: titleCell?.header,
        message: `Row ${line}: no task name — the column mapped to Title is empty.`,
      },
    }
  }
  if (title.length > MAX_TITLE) {
    return {
      ok: false,
      rejection: {
        row: line,
        code: 'title_too_long',
        column: titleCell?.header,
        value: String(title.length),
        message: `Row ${line}: the task name is ${title.length} characters — the limit is ${MAX_TITLE}.`,
      },
    }
  }

  const readDate = (
    field: 'dueDate' | 'startDate',
  ): { ok: true; date?: Date; hasTime: boolean } | { ok: false; rejection: RowRejection } => {
    const cell = pick(field)
    if (!cell || !cell.value) return { ok: true, hasTime: false }
    const ms = Date.parse(cell.value)
    if (Number.isNaN(ms)) {
      return {
        ok: false,
        rejection: {
          row: line,
          code: 'invalid_date',
          column: cell.header,
          value: cell.value,
          message: `Row ${line}: "${cell.value}" in ${cell.header} is not a date.`,
        },
      }
    }
    return { ok: true, date: new Date(ms), hasTime: cellHasTime(cell.value) }
  }

  const due = readDate('dueDate')
  if (!due.ok) return { ok: false, rejection: due.rejection }
  const start = readDate('startDate')
  if (!start.ok) return { ok: false, rejection: start.rejection }

  const status = mapStatus(pick('status')?.value)

  return {
    ok: true,
    row: {
      row: line,
      title,
      description: pick('description')?.value || undefined,
      status,
      statusCategory: statusCategoryOf(status),
      priority: normalizePriority(pick('priority')?.value, opts.priorityScale),
      dueDate: due.date,
      startDate: start.date,
      dueDateHasTime: due.hasTime,
      startDateHasTime: start.hasTime,
      assignees: splitCell(pick('assignees')?.value),
      listName: pick('list')?.value || opts.defaultListName || DEFAULT_LIST_NAME,
      tags: splitCell(pick('tags')?.value),
    },
  }
}

/** Map every row, keeping the accepted ones and the rejections side by side. */
export function mapSheet(
  table: SheetTable,
  mapping: ColumnMapping,
  opts: { priorityScale: PriorityScale; defaultListName?: string },
): { rows: MappedRow[]; rejections: RowRejection[] } {
  const rows: MappedRow[] = []
  const rejections: RowRejection[] = []
  for (const entry of table.rows) {
    // A wholly blank line is not a rejection; it is nothing.
    if (entry.cells.every((c) => c.trim() === '')) continue
    const res = mapRow(entry, table.headers, mapping, opts)
    if (res.ok) rows.push(res.row)
    else rejections.push(res.rejection)
  }
  return { rows, rejections }
}

/** The task fields a merge may write — those a sheet carries values for. */
export type MergeSet = {
  description?: string
  status?: TaskStatus
  statusCategory?: StatusCategory
  priority?: TaskPriority
  dueDate?: Date
  startDate?: Date
  dueDateHasTime?: boolean
  startDateHasTime?: boolean
}

/**
 * WHAT A MERGE WRITES: THE FIELDS THE FILE MAPS, AND NO OTHER
 * (`found-5-oct/import-merge-resets-fields-the-file-lacks`). The merge wrote
 * `status` and `priority` from every row, and a row of a file with neither
 * column carries `mapStatus(undefined)` = "To do" and
 * `normalizePriority(undefined)` = "Normal": a matched task In progress and
 * High came out of a merge To do and Normal, where the page promises to
 * "update the matching task's fields from the imported row". A field the file
 * does not map is not in the row, so it is left as it is. A mapped field is
 * written as it was before: status and priority from the cell, and the
 * description and dates when the cell holds one.
 */
export function mergeSet(row: MappedRow, mapping: ColumnMapping): MergeSet {
  const mapped = new Set(Object.values(mapping))
  const set: MergeSet = {}
  if (mapped.has('description') && row.description !== undefined) set.description = row.description
  if (mapped.has('status')) {
    set.status = row.status
    set.statusCategory = row.statusCategory
  }
  if (mapped.has('priority')) set.priority = row.priority
  // Each date with whether its cell held a time (`cellHasTime`).
  if (mapped.has('dueDate') && row.dueDate) Object.assign(set, { dueDate: row.dueDate, dueDateHasTime: row.dueDateHasTime })
  if (mapped.has('startDate') && row.startDate) Object.assign(set, { startDate: row.startDate, startDateHasTime: row.startDateHasTime })
  return set
}

/** A mapping can only be run when exactly one column feeds the title. */
export function mappingError(mapping: ColumnMapping): string | null {
  const titles = Object.values(mapping).filter((f) => f === 'title').length
  if (titles === 0) return 'Map one column to Title — a task without a name cannot be created.'
  if (titles > 1) return `Map exactly one column to Title (${titles} are mapped).`
  return null
}
