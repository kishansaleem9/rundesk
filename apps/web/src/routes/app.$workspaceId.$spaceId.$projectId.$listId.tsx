import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PersonAvatar,
  cn,
  toast,
} from '@rundesk/ui'
import {
  TaskListChrome,
  WorkFilterSelect,
  WorkViewTabs,
  type WorkViewTab,
} from '../components/work/work-ui'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Plus,
  Flag,
  Diamond,
  Calendar as CalendarIcon,
  X as XIcon,
  Archive,
  Filter,
  Search,
  Share2,
  MoreHorizontal,
  ClipboardList,
  Download,
  Settings2,
  Save,
  Pin,
  Lock,
  ShieldCheck,
  Home,
  Link2,
  // §M frame `12:10` — the three chips' glyphs, in the frame's order: a
  // layered stack, a branching subtask, a three-column block.
  Layers,
  GitBranch,
  Columns3,
  Check,
  // §V2-S13 frame `10:35` — the two rows the Customize panel leads with:
  // a card-density grid, and the cover's picture.
  LayoutGrid,
  Image as ImageIcon,
  // §V2-S13 frame `10:35` — the three board switches: a stack, an empty
  // outline, and two columns folding in.
  AlignLeft,
  SquareDashed,
  FoldHorizontal,
  // §V2-07 frame `11:30` — the `⚇ Assignee` chip's two-person glyph, and the
  // three "Tasks where I have assigned" rows' own icons.
  Users,
  MessageSquare,
  // §V2-07 frame `11:00` — the "⚡ Business feature" caption under Download.
  Zap,
} from 'lucide-react'
import { api, ApiError, downloadFile } from '../lib/api'
import { useAuthStore } from '../store/auth'
import {
  useSpaceFeatures,
  ALL_SPACE_FEATURES,
  type SpaceFeatures,
} from '../lib/use-space-features'
/*
 * A1.4 / §V2-07 — the filter tree and its evaluator now live in `lib/task-filters.ts`.
 * They were the one piece of real logic in this file that no test could
 * reach, because reaching it meant importing a route.
 */
import {
  type FilterOp,
  type FilterFieldKind,
  type FilterRule,
  type FilterGroup,
  type FilterNode,
  type FilterContext,
  isFilterGroup,
  filterLeaves,
  countLeaves,
  matchesNode,
  filterFieldKind,
  dayKey,
  OPS_BY_KIND,
  VALUELESS_OPS,
  BUILTIN_FILTER_FIELDS,
  UNASSIGNED_FILTER,
} from '../lib/task-filters'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { toDateInput, withDatePart } from '../lib/task-dates'
import { criticalPath } from '../lib/gantt'
import { TaskDetailSheet } from '../components/task-detail-sheet'
import { FreshnessControls, useRefreshInterval } from '../components/freshness-controls'
import { ListStatusesManager } from '../components/list-statuses-manager'
import { ListEmailAliasPanel } from '../components/list-email-alias-panel'
import { SharePanel } from '../components/share-panel'
// §V2-13 frames `09:26` / `10:42` — the one gate, reused. Not a second dialog:
// the whole reason `feature-gate.tsx` exists is that every locked feature
// should explain itself the same way.
import { useFeatureGate, type GatedFeature } from '../components/feature-gate'
import { getRealtimeSocket } from '../lib/realtime'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { ListSkeleton } from '../components/loading-skeletons'
import { relativeTime } from '../lib/relative-time'

type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
// Status is now a free-text key validated against the list's list_statuses.
type TaskStatus = string
type StatusCategory = 'open' | 'in_progress' | 'closed'

type ListStatus = {
  id: string
  listId: string
  key: string
  name: string
  color: string
  category: StatusCategory
  position: number
}

type TaskAssignee = {
  userId: string
  user?: { displayName?: string | null }
}
type WorkspaceMember = { userId: string; displayName: string; email: string }

// A task's child subtask. The list endpoint hydrates the full child row, so
// beyond status we also get title/priority/dueDate for the nested tree (§4.3).
type Subtask = {
  id: string
  title?: string
  status?: string | null
  statusCategory?: StatusCategory | null
  priority?: TaskPriority
  dueDate?: string | null
  isMilestone?: boolean
}


/**
 * §1.1 — what kind of task this is, on the row.
 *
 * The type was settable in the create modal, changeable in the detail sheet and
 * filterable in search, and visible in none of the places a member actually
 * scans work — so you had to open a task to learn what it was.
 *
 * The workspace default is deliberately not drawn. Every task has a type now,
 * so marking the ordinary ones would put an icon on every row and carry no
 * information; the point is to see the ones that are something else. Milestones
 * already have their diamond, so they are not doubled up either.
 */
function TaskTypeMark({
  type,
}: {
  type?: { id: string; name: string; icon: string | null; isDefault?: boolean } | null
}) {
  if (!type || type.isDefault || !type.icon) return null
  return (
    <span
      className="shrink-0 text-[11px] leading-none opacity-70"
      title={type.name}
      aria-label={type.name}
      data-testid="task-type-mark"
    >
      {type.icon}
    </span>
  )
}

type TaskItem = {
  id: string
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  statusCategory?: StatusCategory
  isMilestone?: boolean
  /** §1.1 — what kind of task this is, so a row can show it. */
  taskType?: { id: string; name: string; icon: string | null; isDefault?: boolean } | null
  startDate?: string | null
  dueDate?: string | null
  createdAt?: string | null
  /** §V2-07 — "Date closed" in the filter list, frame 11:41. */
  completedAt?: string | null
  // Both come back on every row already; the filter builder (A1.4) is the
  // first thing in this view to read them.
  createdById?: string | null
  recurrence?: Record<string, unknown> | null
  assignees?: TaskAssignee[]
  // Sent on every list row already (tasks.service.ts attaches them); the board
  // card is the first thing here to render them.
  labels?: Array<{ id: string; name: string; color: string }>
  subtasks?: Subtask[]
  openBlockerCount?: number
  blocksOpenCount?: number
  blockedBy?: string[]
  /*
   * §V2-S13 frame `10:35` — "Card cover  Image ›".
   *
   * `coverUrl` is the one field a card can render: the API resolves a stored
   * key (presigned) or a linked address (verbatim) into it. It used to come
   * back only from the single-task read, so the cover a person set was visible
   * on exactly the surface that set it. `coverColor` is the Gallery's colour,
   * which is a cover too, and `coverOffsetY` is where Reposition left it.
   */
  coverUrl?: string | null
  coverColor?: string | null
  coverOffsetY?: number | null
}

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'

/*
 * Offered when CREATING a field from this view's picker.
 *
 * The comment here used to read "deliberately the same set this view knows how
 * to render". Half of that was true and the half that was not is 0146's find:
 * the picker offers six, but the COLUMNS draw whatever the project has, and a
 * definition made anywhere else — the create modal offers all twenty-two —
 * lands in this grid all the same. Until 0146 every one of them rendered as
 * `String(value)`, so a `people` field drew a comma-separated list of uuids,
 * and clicking the cell opened a text box whose save the API answered 400.
 * `customCellText` and `INLINE_EDITABLE_TYPES` below are what make the second
 * half of the sentence true.
 */
const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'checkbox', 'url', 'dropdown'] as const
const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, TranslationKey> = {
  text: 'list.table.fieldTypeText',
  number: 'list.table.fieldTypeNumber',
  date: 'list.table.fieldTypeDate',
  checkbox: 'list.table.fieldTypeCheckbox',
  url: 'list.table.fieldTypeUrl',
  dropdown: 'list.table.fieldTypeDropdown',
}
type CustomFieldDef = {
  id: string
  name: string
  /*
   * WHATEVER THE SERVER HOLDS, not what this view's picker offers. Typing it
   * as the six was a claim the data does not make: these come from
   * `/projects/:id/custom-fields`, and a field created in the task modal is
   * any of twenty-two. The narrow type is why every renderer here believed it
   * was looking at a string.
   */
  type: CustomFieldType | (string & {})
  options?: Array<{ label: string; value: string }> | null
}
type CustomFieldValue = {
  definition: { id: string }
  value: string | number | boolean | string[] | null
}

/**
 * 0146 — the types a cell in this grid can really EDIT in place.
 *
 * Everything else is drawn read-only. The alternative, which is what this file
 * did until now, is a text box over a `people` field: it accepts what you type,
 * sends it, and the API answers 400 into a promise nobody reads. A control
 * that cannot succeed is the dead control, and it is worse in a grid than
 * anywhere else because the cell looks exactly like the ones that work.
 *
 * `rating` and `progress_manual` are deliberately absent although they are
 * numbers: both are bounded (0–5, 0–100) and a bare number box makes the
 * refusal a matter of what somebody happens to type. They have real editors on
 * the task sheet.
 */
const INLINE_EDITABLE_TYPES: ReadonlySet<string> = new Set([
  'text', 'long_text', 'location', 'url', 'email', 'phone',
  'number', 'money', 'date', 'checkbox', 'dropdown', 'tshirt_size',
])

/** §V2-01c — the fixed set, the same one the task sheet and the API use. */
const TSHIRT_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const

/**
 * What one custom-field cell says.
 *
 * Separate from the editor because a cell is read far more often than it is
 * written, and because `String(value)` on an array is how `people` came to
 * render `4d1f…,9ab2…` in a 9rem column.
 */
function customCellText(
  field: CustomFieldDef,
  value: unknown,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const DASH = '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return DASH
    if (field.type === 'labels') {
      // Labels have their names on the definition, so they are readable.
      const opts = field.options ?? []
      return value.map((v) => opts.find((o) => o.value === v)?.label ?? String(v)).join(', ')
    }
    /*
     * People, files, voting and tasks are ids, and this view has nothing to
     * resolve them against. THE COUNT IS WHAT IT HONESTLY KNOWS — drawing the
     * ids would be a column of noise that looks like data.
     */
    return t('list.table.cellSelected', { n: value.length })
  }
  if (value === null || value === undefined || value === '') return DASH
  switch (field.type) {
    case 'checkbox':
      return value ? '✓' : DASH
    case 'signature':
      return t('list.table.cellSigned')
    case 'progress_auto':
    case 'progress_manual':
      return `${value}%`
    case 'money':
      return `$${value}`
    case 'tshirt_size':
      return String(value).toUpperCase()
    case 'dropdown':
      return (field.options ?? []).find((o) => o.value === value)?.label ?? String(value)
    default:
      return String(value)
  }
}

export const Route = createFileRoute('/app/$workspaceId/$spaceId/$projectId/$listId')({
  /*
   * `?task=<id>` is what quick-create and a task link in chat both navigate to,
   * and what the effect below opens the detail sheet from. Declared rather than
   * only read: the parent route now has a search schema, and an undeclared key
   * on a child is one a router is entitled to drop.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { task?: string; view?: string; comment?: string } => ({
    ...(typeof search.task === 'string' && search.task ? { task: search.task } : {}),
    /*
     * §V2-07 "Copy link to view" (frames 10:36 / 11:14) — a view has to be
     * addressable, or the menu item has nothing to copy. Declared here because
     * an undeclared key is one the router is entitled to drop.
     */
    ...(typeof search.view === 'string' && search.view ? { view: search.view } : {}),
    /*
     * §V2-S06 frame `05:55` — a SAVED COMMENT is addressable.
     *
     * The Inbox's Later tab links to `?task=…&comment=…`; the sheet reads this
     * one, opens the Comments tab and marks that comment. Without it a saved
     * comment could only ever link to the task, which for a busy thread is
     * barely better than not having saved it.
     */
    ...(typeof search.comment === 'string' && search.comment ? { comment: search.comment } : {}),
  }),
  component: ListDetail,
})

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'text-red-600',
  high: 'text-orange-500',
  normal: 'text-blue-500',
  low: 'text-gray-400',
}
const PRIORITY_OPTIONS: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

// Enum → display-label-key maps. The raw identifier stays the persisted/compared
// value; only the shown label is localized (mirrors task-detail-sheet.tsx).
const PRIORITY_LABEL_KEYS: Record<TaskPriority, TranslationKey> = {
  urgent: 'taskDetail.priority.urgent',
  high: 'taskDetail.priority.high',
  normal: 'taskDetail.priority.normal',
  low: 'taskDetail.priority.low',
}
const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  backlog: 'taskDetail.status.backlog',
  todo: 'taskDetail.status.todo',
  in_progress: 'taskDetail.status.inProgress',
  in_review: 'taskDetail.status.inReview',
  done: 'taskDetail.status.done',
  cancelled: 'taskDetail.status.cancelled',
}

// Resolve a status's display label: a known built-in status key renders its
// localized catalog label; any other (custom/scoped, server-defined) status
// shows its server-provided name verbatim — user data is never translated.
function resolveStatusLabel(
  statusKey: string,
  serverName: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  const labelKey = STATUS_LABEL_KEYS[statusKey]
  if (labelKey) return t(labelKey)
  return serverName ?? statusKey
}

// User-facing short date (e.g. "Mar 4"), localized via Intl so month names
// follow the active locale instead of a fixed English date-fns token.
function shortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

// Converts a native <input type="date"> value (yyyy-MM-dd, or '') into an ISO
// date string the backend's @IsDateString() accepts, or undefined when blank so
// the field is omitted from the create body entirely.
function dateInputToIso(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

// Builds the POST /tasks body, defaulting priority to 'normal' and omitting
// blank optional dates (an empty string would fail @IsDateString validation).
function buildCreateTaskBody(input: {
  listId: string
  title: string
  status?: string
  priority?: TaskPriority
  dueDate?: string
  startDate?: string
  /** §V2-S13 `10:52` — set when the group being added to IS an assignee. */
  assigneeIds?: string[]
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    listId: input.listId,
    title: input.title,
    priority: input.priority ?? 'normal',
  }
  if (input.status) body.status = input.status
  if (input.assigneeIds?.length) body.assigneeIds = input.assigneeIds
  const dueDate = dateInputToIso(input.dueDate ?? '')
  if (dueDate) body.dueDate = dueDate
  const startDate = dateInputToIso(input.startDate ?? '')
  if (startDate) body.startDate = startDate
  return body
}

// ---------------------------------------------------------------------------
// Shared per-column sort + filter model (Plan §5.1/§5.5). One source of truth
// drives the global toolbar, the List column bar, and the Table headers so they
// never desync. Custom-field sort (`custom:<id>`) is resolved inside TableView,
// which is the only place that has the loaded custom-field values.
// ---------------------------------------------------------------------------
type SortDir = 'asc' | 'desc'
type SortField = 'title' | 'status' | 'priority' | 'due' | 'assignee' | 'created' | `custom:${string}`
type SortState = { field: SortField; dir: SortDir }
type ColumnFilters = { statuses: string[]; priorities: TaskPriority[]; assignees: string[] }
const EMPTY_COLUMN_FILTERS: ColumnFilters = { statuses: [], priorities: [], assignees: [] }
/**
 * One frozen empty set, shared, so `filterTasks`'s default argument is the
 * same object every call — a fresh `new Set()` would be a new identity on
 * every render and would defeat the memo that wraps it.
 */
const EMPTY_TASK_ID_SET: ReadonlySet<string> = new Set<string>()

/**
 * §M frame `12:10` — how the Subtasks chip is set.
 *
 * `collapsed` and `expanded` decide where a parent row STARTS; `separate` is a
 * different question asked of the server (`includeSubtasks=true`), so the
 * children arrive as rows of their own and the nesting is switched off — with
 * both on, every child would be drawn twice.
 */
type SubtaskMode = 'collapsed' | 'expanded' | 'separate'

/**
 * The hideable built-in columns, and WHICH VIEW ACTUALLY DRAWS EACH ONE.
 *
 * The list rows and the table do not render the same set — the list row has no
 * status pill and no created date — so a single panel listing all five would
 * offer the list two switches that could change nothing. A control that cannot
 * do what its label says is worse than a missing one, because it reads as
 * done. `views` is what keeps the panel honest.
 *
 * Name/title is deliberately absent: the reference will not let you hide it
 * either, and a row with no name is not a row.
 */
const BUILTIN_COLUMNS: { key: string; labelKey: TranslationKey; views: ('list' | 'table')[] }[] = [
  { key: 'col:status', labelKey: 'list.columns.status', views: ['table'] },
  { key: 'col:priority', labelKey: 'list.columns.priority', views: ['list', 'table'] },
  { key: 'col:assignees', labelKey: 'list.columns.assignees', views: ['list', 'table'] },
  { key: 'col:due', labelKey: 'list.columns.due', views: ['list', 'table'] },
  { key: 'col:created', labelKey: 'list.columns.created', views: ['table'] },
]

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

function defaultSortDir(field: SortField): SortDir {
  // "Newest first" for created; everything else reads best ascending
  // (A→Z, urgent→low, soonest due first, first status first).
  return field === 'created' ? 'desc' : 'asc'
}

function columnFiltersActive(f: ColumnFilters): boolean {
  return f.statuses.length > 0 || f.priorities.length > 0 || f.assignees.length > 0
}



function filterTasks(
  tasks: TaskItem[],
  statusFilter: 'all' | TaskStatus,
  filters: ColumnFilters,
  search = '',
  rules: FilterNode[] = [],
  ctx: FilterContext = { customFields: [], customValues: {} },
  /*
   * §V2-07 `[11:32]` — "Show closed tasks". Closed is the status CATEGORY, so a
   * list whose statuses have been renamed still knows which ones mean finished;
   * `status === 'done'` is the fallback for rows written before categories
   * existed, and is the same pair every other check in this file uses.
   */
  showClosed = true,
  /*
   * §V2-07 frame `11:30` — the task ids the three "Tasks where I have
   * assigned" switches add, resolved by the server (the payload carries no
   * comment or checklist assignment, so two of the three cannot be answered
   * here). Empty means "nothing to add", which is exactly the behaviour
   * before this existed.
   */
  alsoAssigned: ReadonlySet<string> = EMPTY_TASK_ID_SET,
): TaskItem[] {
  const needle = search.trim().toLowerCase()
  if (
    statusFilter === 'all' &&
    !columnFiltersActive(filters) &&
    !needle &&
    rules.length === 0 &&
    showClosed
  ) {
    return tasks
  }
  return tasks.filter((task) => {
    if (!showClosed && (task.statusCategory === 'closed' || task.status === 'done')) return false
    if (needle && !task.title.toLowerCase().includes(needle)) return false
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
    if (rules.some((node) => !matchesNode(task, node, ctx))) return false
    if (filters.assignees.length > 0) {
      const ids = (task.assignees ?? []).map((a) => a.userId)
      const matchesUnassigned = filters.assignees.includes(UNASSIGNED_FILTER) && ids.length === 0
      const matchesSomeone = ids.some((id) => filters.assignees.includes(id))
      /*
       * §V2-07 `11:30` — a task with no assignee at all still belongs in
       * "tasks where I have assigned" when the only thing assigned to me on it
       * is a comment, a subtask or a checklist item. Deliberately NOT applied
       * to the Unassigned option: a task that has something of mine on it is
       * not unassigned in the sense that filter means.
       */
      const matchesVia = !matchesUnassigned && alsoAssigned.has(task.id)
      if (!matchesUnassigned && !matchesSomeone && !matchesVia) return false
    }
    return true
  })
}

function firstAssigneeName(task: TaskItem): string {
  return task.assignees?.[0]?.user?.displayName ?? '￿' // unassigned sorts last
}

function compareCustomValue(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function compareByField(
  a: TaskItem,
  b: TaskItem,
  field: SortField,
  statusOrder: Map<string, number>,
  customValues?: Record<string, Record<string, unknown>>,
): number {
  switch (field) {
    case 'title':
      return a.title.localeCompare(b.title)
    case 'priority':
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    case 'status':
      return (statusOrder.get(a.status) ?? 999) - (statusOrder.get(b.status) ?? 999)
    case 'assignee':
      return firstAssigneeName(a).localeCompare(firstAssigneeName(b))
    case 'due': {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      return da - db
    }
    case 'created': {
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return ca - cb
    }
    default:
      if (field.startsWith('custom:') && customValues) {
        const id = field.slice('custom:'.length)
        return compareCustomValue(customValues[a.id]?.[id], customValues[b.id]?.[id])
      }
      return 0
  }
}

function sortTasks(
  tasks: TaskItem[],
  sort: SortState,
  statusOrder: Map<string, number>,
  customValues?: Record<string, Record<string, unknown>>,
): TaskItem[] {
  const arr = [...tasks]
  arr.sort((a, b) => {
    const base = compareByField(a, b, sort.field, statusOrder, customValues)
    return sort.dir === 'asc' ? base : -base
  })
  return arr
}

const VIRTUALIZE_THRESHOLD = 120
const TASK_ROW_ESTIMATE_PX = 46
const BOARD_VIRTUALIZE_THRESHOLD = 80
/**
 * §V2-S13 frame `10:35` — what "Stack fields" adds to a virtualized card's
 * estimated height: the two extra lines a three-field column takes over a
 * one-line row, at the 11px type the meta block is set in.
 */
const BOARD_STACKED_FIELDS_PX = 36
const TABLE_VIRTUALIZE_THRESHOLD = 120
const TABLE_ROW_ESTIMATE_PX = 36

/*
 * §V2-S13 frame `10:35` — "Card size  Medium ›" and "Card cover  Image ›", the
 * two rows at the top of the Customize view panel, above Stack fields.
 *
 * Card size is a DENSITY, not a label: each value has to produce a measurably
 * different card, or it is a picker whose three options draw the same thing.
 * The numbers below are the whole of the difference — padding, title size, the
 * cover band's height, and the virtualizer's row estimate, which has to follow
 * or a long column scrolls to the wrong place at every size but Medium.
 */
type CardSize = 'small' | 'medium' | 'large'
type CardCover = 'image' | 'off'
const CARD_SIZES = ['small', 'medium', 'large'] as const
const CARD_COVERS = ['image', 'off'] as const
const CARD_SIZE_LABEL_KEYS: Record<CardSize, TranslationKey> = {
  small: 'list.card.sizeSmall',
  medium: 'list.card.sizeMedium',
  large: 'list.card.sizeLarge',
}
const CARD_COVER_LABEL_KEYS: Record<CardCover, TranslationKey> = {
  image: 'list.card.coverImage',
  off: 'list.card.coverOff',
}
const CARD_SIZE_STYLE: Record<CardSize, { pad: string; title: string; cover: string; coverPx: number; estimate: number }> = {
  small:  { pad: 'p-1.5', title: 'text-[12px]', cover: 'h-10', coverPx: 40, estimate: 60 },
  medium: { pad: 'p-2',   title: 'text-sm',     cover: 'h-16', coverPx: 64, estimate: 76 },
  large:  { pad: 'p-3',   title: 'text-[15px]', cover: 'h-28', coverPx: 112, estimate: 104 },
}

type StatusMeta = { label: string; color: string; dot: string; pill: string }

// Fallback meta for the 6 originally-seeded statuses; used when a list
// hasn't loaded yet or a task references a key that's been deleted.
const DEFAULT_STATUS_META: Record<string, StatusMeta> = {
  backlog: { label: 'Backlog', color: '#94a3b8', dot: 'bg-zinc-400', pill: 'bg-muted/60 text-muted-foreground border-border' },
  todo: { label: 'To do', color: '#64748b', dot: 'bg-slate-500', pill: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-400/40' },
  in_progress: { label: 'In progress', color: '#3b82f6', dot: 'bg-blue-500', pill: 'bg-blue-500/15 text-blue-700 dark:text-blue-200 border-blue-400/40' },
  in_review: { label: 'In review', color: '#a855f7', dot: 'bg-purple-500', pill: 'bg-purple-500/15 text-purple-700 dark:text-purple-200 border-purple-400/40' },
  done: { label: 'Done', color: '#10b981', dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-400/40' },
  cancelled: { label: 'Cancelled', color: '#f43f5e', dot: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-400/40' },
}

const ListStatusesContext = createContext<ListStatus[]>([])

/**
 * §V2-06 — the space's ClickApps, for the row components that are three levels
 * down from where they are read. A context beside the one this file already
 * uses, rather than a `showTags` prop threaded through Board → Column → Card.
 * Defaults to everything on, so a component rendered outside the provider
 * (a test, a story) shows the app as it has always looked.
 */
const SpaceFeaturesContext = createContext<SpaceFeatures>(ALL_SPACE_FEATURES)
function useSpaceFeatureFlags() {
  return useContext(SpaceFeaturesContext)
}

function useListStatuses() {
  return useContext(ListStatusesContext)
}

function pillStyleFor(color: string): React.CSSProperties {
  return {
    backgroundColor: `${color}26`,
    color,
    borderColor: `${color}66`,
  }
}

function useStatusMeta(statusKey: string): StatusMeta {
  const { t } = useTranslation()
  const statuses = useListStatuses()
  const dynamic = statuses.find((s) => s.key === statusKey)
  if (dynamic) {
    return {
      label: resolveStatusLabel(statusKey, dynamic.name, t),
      color: dynamic.color,
      // Dynamic colours don't map cleanly to tailwind classes, so we use
      // inline style via pillStyleFor() at the call site instead.
      dot: '',
      pill: '',
    }
  }
  const fallback = DEFAULT_STATUS_META[statusKey]
  if (fallback) {
    return { ...fallback, label: resolveStatusLabel(statusKey, fallback.label, t) }
  }
  return {
    label: resolveStatusLabel(statusKey, statusKey, t),
    color: '#94a3b8',
    dot: 'bg-zinc-400',
    pill: 'bg-muted/60 text-muted-foreground border-border',
  }
}

function TableStatusLegend() {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 rounded-lg border border-border bg-card/50 text-[11px] text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider text-[10px]">{t('list.table.statusLegend')}</span>
      {ordered.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          <span>{resolveStatusLabel(s.key, s.name, t)}</span>
        </div>
      ))}
    </div>
  )
}

function useOrderedStatuses(): ListStatus[] {
  const statuses = useListStatuses()
  if (statuses.length === 0) {
    // Fallback to the legacy default order when the list hasn't loaded yet.
    return Object.entries(DEFAULT_STATUS_META).map(([key, meta], i) => ({
      id: key,
      listId: '',
      key,
      name: meta.label,
      color: meta.color,
      category:
        key === 'done' || key === 'cancelled'
          ? 'closed'
          : key === 'in_progress' || key === 'in_review'
          ? 'in_progress'
          : 'open',
      position: i,
    }))
  }
  return [...statuses].sort((a, b) => a.position - b.position)
}

// A clickable column label that sorts by `field`, toggling asc/desc when it's
// already the active sort (Plan §5.1/§5.5). Shared by the List bar + Table head.
function SortHeaderButton({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string
  field: SortField
  sort: SortState
  onSort: (field: SortField) => void
  className?: string
}) {
  const { t } = useTranslation()
  const active = sort.field === field
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSort(field)
      }}
      className={cn('inline-flex items-center gap-1 min-w-0 hover:text-foreground transition-colors', active && 'text-foreground', className)}
      aria-label={t('list.sortColumnAria', { column: label })}
      title={t('list.sortColumnAria', { column: label })}
    >
      <span className="truncate">{label}</span>
      <span className={cn('text-[8px] leading-none', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40')} aria-hidden>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </button>
  )
}

type FilterOption = { value: string; label: string; color?: string }

// A funnel button + checkbox popover that toggles values in a column filter set.
function ColumnFilterMenu({
  ariaLabel,
  options,
  selected,
  onChange,
}: {
  ariaLabel: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const active = selected.length > 0
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={cn(
          'rounded p-0.5 transition-colors hover:bg-muted/60',
          active ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/60 opacity-0 group-hover:opacity-100',
        )}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <Filter className={cn('h-3 w-3', active && 'fill-current')} />
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 right-0 w-48 rounded-md border border-border bg-card p-1 shadow-lg normal-case"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-56 overflow-auto">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] font-normal tracking-normal hover:bg-muted/40 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                {opt.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />}
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] font-normal tracking-normal text-muted-foreground hover:bg-muted/40"
            >
              {t('list.filter.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const FILTER_OP_LABEL_KEYS: Record<FilterOp, TranslationKey> = {
  is: 'list.filter.opIs',
  isNot: 'list.filter.opIsNot',
  before: 'list.filter.opBefore',
  after: 'list.filter.opAfter',
  between: 'list.filter.opBetween',
  contains: 'list.filter.opContains',
  gt: 'list.filter.opGreaterThan',
  lt: 'list.filter.opLessThan',
  isSet: 'list.filter.opIsSet',
  isNotSet: 'list.filter.opIsNotSet',
}

/**
 * A1.4 / §V2-07 — the Filters panel of frame `11:41`.
 *
 * `[11:13]` "Ab yahan pe FILTERS hain — aap filters add kar sakte ho agar aap
 * us Customize wale option pe click karte ho." The frame shows a "Select
 * filter" row over Status · Tags · Due date · Priority · Assignee · Archived ·
 * Created by · Date closed · Date created, a **+ Add filter**, an **Add nested
 * filter**, and **Saved filters ▾**.
 *
 * Two things changed here beyond the field list. Rows can now be bracketed —
 * a nested group with its own AND/OR, which is the only way to express
 * "urgent and (mine or unassigned)" — and a set of rows can be saved under a
 * name and re-applied, per user, per list.
 *
 * It still sits beside the column funnels rather than replacing them; those
 * stay the one-click path for the three attributes that have a column.
 */
function FilterBuilderMenu({
  listId,
  nodes,
  onChange,
  customFields,
  workspaceMembers,
  statusOptions,
  labelOptions,
  hiddenFields = [],
}: {
  listId: string
  nodes: FilterNode[]
  onChange: (next: FilterNode[]) => void
  customFields: CustomFieldDef[]
  workspaceMembers: WorkspaceMember[]
  statusOptions: FilterOption[]
  /** Derived from the tasks on this list — a tag no task here carries would
   *  filter to nothing anyway, so offering it would only mislead. */
  labelOptions: FilterOption[]
  /** §V2-06 — filter fields the space's ClickApps have switched off. */
  hiddenFields?: string[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const { data: presets = [] } = useQuery({
    queryKey: ['list-filters', listId],
    queryFn: () => api<Array<{ id: string; name: string; rules: FilterNode[] }>>(`/lists/${listId}/filters`),
    enabled: open,
  })
  const refreshPresets = () => qc.invalidateQueries({ queryKey: ['list-filters', listId] })

  const fieldOptions = [
    ...BUILTIN_FILTER_FIELDS.filter((f) => !hiddenFields.includes(f.id)).map((f) => ({
      value: f.id,
      label: t(f.labelKey),
    })),
    ...customFields.map((f) => ({ value: `custom:${f.id}`, label: f.name })),
  ]

  const leafCount = countLeaves(nodes)

  /* ── editing the tree ───────────────────────────────────────────────────
   *
   * Every edit goes through `replace`, which walks the top level and, for a
   * group, its rules. One walker, so a rule inside a bracket is edited by the
   * same code as a rule outside it — the alternative is two nearly-identical
   * code paths that drift the first time an operator is added.
   */
  const replace = (ruleId: string, next: Partial<FilterRule> | null) =>
    onChange(
      nodes
        .map((node) => {
          if (!isFilterGroup(node)) {
            if (node.id !== ruleId) return node
            return next === null ? null : { ...node, ...next }
          }
          if (!node.rules.some((r) => r.id === ruleId)) return node
          const rules = next === null
            ? node.rules.filter((r) => r.id !== ruleId)
            : node.rules.map((r) => (r.id === ruleId ? { ...r, ...next } : r))
          return { ...node, rules }
        })
        .filter((n): n is FilterNode => n !== null),
    )

  const newId = (suffix: string) => `${Date.now()}-${suffix}-${Math.random().toString(36).slice(2, 7)}`

  const blankRule = (): FilterRule => {
    const field = fieldOptions[0]?.value ?? 'status'
    const kind = filterFieldKind(field, customFields) ?? 'choice'
    return { id: newId('r'), field, op: OPS_BY_KIND[kind][0], value: '' }
  }

  const addRule = () => onChange([...nodes, blankRule()])

  /** "Add nested filter" — a bracket, pre-loaded with one row to edit. */
  const addGroup = () =>
    onChange([...nodes, { id: newId('g'), conjunction: 'or', rules: [blankRule()] }])

  const addToGroup = (groupId: string) =>
    onChange(
      nodes.map((node) =>
        isFilterGroup(node) && node.id === groupId
          ? { ...node, rules: [...node.rules, blankRule()] }
          : node,
      ),
    )

  const setConjunction = (groupId: string, conjunction: 'and' | 'or') =>
    onChange(nodes.map((n) => (isFilterGroup(n) && n.id === groupId ? { ...n, conjunction } : n)))

  const removeNode = (nodeId: string) => onChange(nodes.filter((n) => n.id !== nodeId))

  // Changing the field can invalidate the operator (a date "before" makes no
  // sense on a creator), so re-seed both operator and value from the new kind.
  const changeField = (rule: FilterRule, field: string) => {
    const kind = filterFieldKind(field, customFields) ?? 'text'
    replace(rule.id, { field, op: OPS_BY_KIND[kind][0], value: '', value2: undefined })
  }

  /** The options a `choice` field offers, which now depends on which field. */
  const choiceOptions = (field: string): FilterOption[] => {
    if (field === 'status') return statusOptions
    if (field === 'tags') return labelOptions
    if (field === 'priority') return PRIORITY_OPTIONS.map((p) => ({ value: p, label: t(PRIORITY_LABEL_KEYS[p]) }))
    const def = customFields.find((f) => `custom:${f.id}` === field)
    if (def?.type === 'checkbox') {
      return [
        { value: 'true', label: t('list.filter.checked') },
        { value: 'false', label: t('list.filter.unchecked') },
      ]
    }
    return (def?.options ?? []).map((o) => ({ value: o.value, label: o.label }))
  }

  const valueInput = (rule: FilterRule) => {
    if (VALUELESS_OPS.includes(rule.op)) return null
    const kind = filterFieldKind(rule.field, customFields)
    const cls = 'h-7 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-[12px]'
    if (kind === 'date') {
      return (
        <>
          <input
            type="date"
            value={rule.value}
            onChange={(e) => replace(rule.id, { value: e.target.value })}
            aria-label={t('list.filter.value')}
            className={cls}
          />
          {rule.op === 'between' && (
            <input
              type="date"
              value={rule.value2 ?? ''}
              onChange={(e) => replace(rule.id, { value2: e.target.value })}
              aria-label={t('list.filter.valueTo')}
              className={cls}
            />
          )}
        </>
      )
    }
    if (kind === 'user') {
      return (
        <select
          value={rule.value}
          onChange={(e) => replace(rule.id, { value: e.target.value })}
          aria-label={t('list.filter.value')}
          className={cls}
        >
          <option value="">{t('list.filter.pickValue')}</option>
          {/* Assignee is a set, so it can also be asked about being empty. */}
          {rule.field === 'assignee' && (
            <option value={UNASSIGNED_FILTER}>{t('list.group.unassigned')}</option>
          )}
          {workspaceMembers.map((m) => (
            <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
          ))}
        </select>
      )
    }
    if (kind === 'choice') {
      return (
        <select
          value={rule.value}
          onChange={(e) => replace(rule.id, { value: e.target.value })}
          aria-label={t('list.filter.value')}
          className={cls}
        >
          <option value="">{t('list.filter.pickValue')}</option>
          {choiceOptions(rule.field).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type={kind === 'number' ? 'number' : 'text'}
        value={rule.value}
        onChange={(e) => replace(rule.id, { value: e.target.value })}
        placeholder={t('list.filter.value')}
        aria-label={t('list.filter.value')}
        className={cls}
      />
    )
  }

  /** One field/operator/value row, wherever it sits. */
  const ruleRow = (rule: FilterRule, prefix: string) => {
    const kind = filterFieldKind(rule.field, customFields) ?? 'text'
    return (
      <div key={rule.id} className="flex items-center gap-1" data-testid="list-filter-rule">
        <span className="w-8 shrink-0 text-[11px] uppercase text-muted-foreground">{prefix}</span>
        <select
          value={rule.field}
          onChange={(e) => changeField(rule, e.target.value)}
          aria-label={t('list.filter.field')}
          className="h-7 w-28 shrink-0 rounded border border-border bg-background px-1 text-[12px]"
        >
          {fieldOptions.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={rule.op}
          onChange={(e) => replace(rule.id, { op: e.target.value as FilterOp })}
          aria-label={t('list.filter.operator')}
          className="h-7 w-24 shrink-0 rounded border border-border bg-background px-1 text-[12px]"
        >
          {OPS_BY_KIND[kind].map((op) => (
            <option key={op} value={op}>{t(FILTER_OP_LABEL_KEYS[op])}</option>
          ))}
        </select>
        {valueInput(rule)}
        <button
          type="button"
          onClick={() => replace(rule.id, null)}
          aria-label={t('list.filter.removeRule')}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const saveCurrent = async () => {
    const name = window.prompt(t('list.filter.savePrompt'))?.trim()
    if (!name) return
    try {
      await api(`/lists/${listId}/filters`, { method: 'POST', body: { name, rules: nodes } })
      await refreshPresets()
      toast.success(t('list.filter.saved'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('list.filter.saveFailed'))
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="list-filter-builder"
        className={cn(
          'h-8 shrink-0 rounded-md border border-border/80 bg-card px-2.5 text-[12px] inline-flex items-center gap-1.5 hover:bg-muted/40',
          leafCount > 0 && 'text-violet-600 dark:text-violet-400',
        )}
        title={t('list.filter.builder')}
      >
        <Filter className={cn('h-3.5 w-3.5', leafCount > 0 && 'fill-current')} />
        {leafCount > 0 ? t('list.filter.builderCount', { count: leafCount }) : t('list.filter.builder')}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-[30rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-2 shadow-lg space-y-1.5">
          {/* Saved filters ▾ — frame 11:41 puts it at the panel's top right. */}
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="text-[12px] font-medium">{t('list.filter.builder')}</span>
            <div className="flex items-center gap-1">
              <select
                value=""
                data-testid="list-filter-presets"
                aria-label={t('list.filter.savedFilters')}
                onChange={(e) => {
                  const preset = presets.find((p) => p.id === e.target.value)
                  if (preset) onChange(Array.isArray(preset.rules) ? preset.rules : [])
                }}
                className="h-7 w-36 rounded border border-border bg-background px-1 text-[12px]"
              >
                <option value="">{t('list.filter.savedFilters')}</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveCurrent}
                disabled={leafCount === 0}
                data-testid="list-filter-save"
                className="rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent"
              >
                {t('list.filter.saveCurrent')}
              </button>
            </div>
          </div>

          {nodes.length === 0 && (
            <p className="px-1 py-1 text-[12px] text-muted-foreground">{t('list.filter.builderEmpty')}</p>
          )}

          {nodes.map((node, idx) => {
            const prefix = idx === 0 ? t('list.filter.where') : t('list.filter.and')
            if (!isFilterGroup(node)) return ruleRow(node, prefix)
            return (
              <div
                key={node.id}
                data-testid="list-filter-group"
                className="rounded border border-dashed border-border/70 p-1.5 space-y-1.5"
              >
                <div className="flex items-center gap-1">
                  <span className="w-8 shrink-0 text-[11px] uppercase text-muted-foreground">{prefix}</span>
                  <select
                    value={node.conjunction}
                    onChange={(e) => setConjunction(node.id, e.target.value as 'and' | 'or')}
                    aria-label={t('list.filter.conjunction')}
                    data-testid="list-filter-conjunction"
                    className="h-7 w-20 rounded border border-border bg-background px-1 text-[12px]"
                  >
                    <option value="or">{t('list.filter.anyOf')}</option>
                    <option value="and">{t('list.filter.allOf')}</option>
                  </select>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => removeNode(node.id)}
                    aria-label={t('list.filter.removeGroup')}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {node.rules.map((rule, i) =>
                  ruleRow(rule, i === 0 ? '' : t(node.conjunction === 'or' ? 'list.filter.or' : 'list.filter.and')),
                )}
                <button
                  type="button"
                  onClick={() => addToGroup(node.id)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('list.filter.addRule')}
                </button>
              </div>
            )
          })}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={addRule}
                data-testid="list-filter-add"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('list.filter.addRule')}
              </button>
              <button
                type="button"
                onClick={addGroup}
                data-testid="list-filter-add-nested"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('list.filter.addNested')}
              </button>
            </div>
            {leafCount > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                {t('list.filter.clearAll')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// A compact sort/filter header for the List view — the "column headers" for a
// grouped list, wired to the same shared sort/columnFilters state (Plan §5.1).
function ListColumnBar({
  sort,
  onSort,
  columnFilters,
  onColumnFilters,
  workspaceMembers,
  groupBy,
  showPriority = true,
}: {
  sort: SortState
  onSort: (field: SortField) => void
  columnFilters: ColumnFilters
  onColumnFilters: (updater: (prev: ColumnFilters) => ColumnFilters) => void
  groupBy: 'status' | 'priority' | 'assignee'
  workspaceMembers: WorkspaceMember[]
  /** §V2-06 — off when the space has switched the Priority feature off. */
  showPriority?: boolean
}) {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
  const statusOptions: FilterOption[] = ordered.map((s) => ({
    value: s.key,
    label: resolveStatusLabel(s.key, s.name, t),
    color: s.color,
  }))
  const priorityOptions: FilterOption[] = PRIORITY_OPTIONS.map((p) => ({ value: p, label: t(PRIORITY_LABEL_KEYS[p]) }))
  const assigneeOptions: FilterOption[] = [
    { value: UNASSIGNED_FILTER, label: t('list.group.unassigned') },
    ...workspaceMembers.map((m) => ({ value: m.userId, label: m.displayName || m.email })),
  ]

  // Every group header already carries the value you grouped by, so repeating it
  // as a column is noise — ClickUp drops it for exactly this reason. The status
  // filter and sort both still live in the toolbar above.
  return (
    <div className="group mb-2 flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <SortHeaderButton label={t('list.table.colTitle')} field="title" sort={sort} onSort={onSort} className="flex-1" />
      <div className={cn('items-center gap-1 w-28 shrink-0', groupBy === 'status' ? 'hidden' : 'flex')}>
        <SortHeaderButton label={t('taskDetail.fieldStatus')} field="status" sort={sort} onSort={onSort} />
        <ColumnFilterMenu
          ariaLabel={t('list.filter.ariaStatus')}
          options={statusOptions}
          selected={columnFilters.statuses}
          onChange={(next) => onColumnFilters((f) => ({ ...f, statuses: next }))}
        />
      </div>
      <div
        className={cn(
          'items-center gap-1 w-24 shrink-0',
          groupBy === 'priority' || !showPriority ? 'hidden' : 'flex',
        )}
      >
        <SortHeaderButton label={t('taskDetail.fieldPriority')} field="priority" sort={sort} onSort={onSort} />
        <ColumnFilterMenu
          ariaLabel={t('list.filter.ariaPriority')}
          options={priorityOptions}
          selected={columnFilters.priorities}
          onChange={(next) => onColumnFilters((f) => ({ ...f, priorities: next as TaskPriority[] }))}
        />
      </div>
      <div className="w-24 shrink-0">
        <SortHeaderButton label={t('taskDetail.fieldDueDate')} field="due" sort={sort} onSort={onSort} />
      </div>
      <div className={cn('items-center gap-1 w-24 shrink-0', groupBy === 'assignee' ? 'hidden' : 'flex')}>
        <SortHeaderButton label={t('taskDetail.fieldAssignees')} field="assignee" sort={sort} onSort={onSort} />
        <ColumnFilterMenu
          ariaLabel={t('list.filter.ariaAssignee')}
          options={assigneeOptions}
          selected={columnFilters.assignees}
          onChange={(next) => onColumnFilters((f) => ({ ...f, assignees: next }))}
        />
      </div>
    </div>
  )
}

function ListDetail() {
  const { workspaceId, spaceId, projectId, listId } = Route.useParams()
  const navigate = useNavigate()
  const { t, tCount, locale } = useTranslation()
  const qc = useQueryClient()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('normal')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [activeView, setActiveView] = useState<'list' | 'board' | 'calendar' | 'table' | 'gantt' | 'team'>('list')
  /*
   * §V2-13, frames `09:26` and `10:42` — the two surfaces she NAMES as paid.
   *
   * `requireFeature` returns true and gets out of the way when the workspace's
   * plan includes the capability; when it does not it opens the teaching
   * paywall and returns false. `available` is the same question asked for
   * RENDERING (a padlock on the tab) rather than for deciding.
   *
   * Neither of these is the gate. `tasks.controller.ts` refuses the rollup and
   * the board-shaped download outright for a workspace whose plan lacks them;
   * this is what a person sees instead of an unexplained 403.
   */
  const { requireFeature, available: featureAvailable, gateDialog, plan } = useFeatureGate(workspaceId)
  /*
   * §V2-07 frame `11:00` — the tier named by the "⚡ Business feature" caption
   * under the export dialog's Download button.
   *
   * Out of the catalog the SERVER sent, by the same rule the gate dialog uses:
   * the lowest tier whose feature map has `boardExport`. `feature-gate.tsx`'s
   * `upgradeTarget` is that rule's first reader and is not exported, and this
   * file is not the one that can export it — so the caption and the dialog are
   * two readers of one catalog, and `list-customize.mjs` asserts they name the
   * same tier so a drift between them is a red suite rather than a wrong
   * price on a label.
   */
  const boardExportPlan = useMemo(() => {
    const tier = plan?.catalog?.find((row) => row.features?.boardExport === true)
    return tier ? { id: tier.id, label: tier.label } : null
  }, [plan])
  const TEAM_VIEW_GATE: GatedFeature = {
    planFeature: 'teamView',
    name: t('gate.teamView'),
    blurb: t('gate.teamViewBlurb'),
    highlights: [t('gate.teamViewPoint1'), t('gate.teamViewPoint2'), t('gate.teamViewPoint3')],
  }
  const BOARD_EXPORT_GATE: GatedFeature = {
    planFeature: 'boardExport',
    name: t('gate.boardExport'),
    blurb: t('gate.boardExportBlurb'),
    highlights: [t('gate.boardExportPoint1'), t('gate.boardExportPoint2'), t('gate.boardExportPoint3')],
  }
  // §5 per-space view config (ClickUp "required views"): which task views this
  // space's lists expose + the default that opens. Reuses the ['spaces', ws]
  // cache, so it adds no fetch beyond what the sidebar/space page already do.
  const spaceViewCfgQuery = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; viewConfig?: { defaultView?: string; enabledViews?: string[] } | null }>>(
        `/spaces/workspace/${workspaceId}`,
      ),
    enabled: !!workspaceId,
  })
  const spaceViewConfig = spaceViewCfgQuery.data?.find((s) => s.id === spaceId)?.viewConfig ?? null
  /*
   * §V2-13 — 'team' added here as well as to the tab list, and the pair is the
   * point. This is a SECOND hand-kept copy of the view set; the API has its own
   * in `space-presets.ts`. A view missing from this one is filtered out of the
   * tabs silently — no error, no empty tab, just absence — which is exactly how
   * the first version of Team View rendered nothing.
   *
   * It is the third duplicated-list bug found in this pass: the planner's two
   * settings types, the two field-type lists, and now this.
   */
  const ALL_VIEWS = ['list', 'board', 'table', 'calendar', 'gantt', 'team'] as const
  const enabledViews: Array<typeof activeView> =
    spaceViewConfig?.enabledViews && spaceViewConfig.enabledViews.length
      ? (spaceViewConfig.enabledViews.filter((v) => (ALL_VIEWS as readonly string[]).includes(v)) as Array<typeof activeView>)
      : [...ALL_VIEWS]
  // Keep a ref in sync so the keyboard 'v' cycler reads the live enabled set
  // without re-subscribing its listener each time the config changes.
  const enabledViewsRef = useRef(enabledViews)
  enabledViewsRef.current = enabledViews
  const appliedSpaceDefaultView = useRef(false)
  useEffect(() => {
    if (!spaceViewConfig) return
    // Correct an active view the space no longer allows.
    if (!enabledViews.includes(activeView)) {
      setActiveView(enabledViews[0])
      return
    }
    // Apply the space's default view once, on first load.
    if (!appliedSpaceDefaultView.current) {
      appliedSpaceDefaultView.current = true
      const dv = spaceViewConfig.defaultView as typeof activeView | undefined
      if (dv && enabledViews.includes(dv)) setActiveView(dv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceViewConfig])
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  // §A2.5 — find a task without leaving the list. Feeds filterTasks, so every
  // view (List / Board / Table / Calendar / Gantt) narrows to the same set.
  const [taskSearch, setTaskSearch] = useState('')
  const [sort, setSort] = useState<SortState>({ field: 'created', dir: 'desc' })
  // Per-column filters (status/priority/assignee) applied on top of the global
  // status filter, shared by the List bar + Table headers (Plan §5.1/§5.5).
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COLUMN_FILTERS)
  // A1.4 filter builder — date / creator / recurrence / custom-field rules,
  // ANDed on top of the column filters and saved with the view.
  const [filterRules, setFilterRules] = useState<FilterNode[]>([])
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'assignee'>('status')
  /*
   * §V2-07 — `[11:32]` "Ab yahan CLOSED TASK — agar aap ko [woh] dekhne hon to
   * aap yeh rakh sakte ho" and `[11:37]` "…ARCHIVE…". Frame `11:14` has "Show
   * closed tasks" in the Customize panel and frame `11:41` has "Archived" in
   * the filter list, so they are two switches, not one: a task can be complete
   * without being archived.
   *
   * The API has understood `includeArchived` since it was written
   * (`tasks.controller.ts`) and the web has never once sent it — archived tasks
   * were unreachable from the list, silently, with no control to explain it.
   *
   * Both defaults are what Rundesk already did, deliberately: closed tasks
   * SHOWN (turning them off by default would hide finished work from every
   * existing user overnight) and archived tasks HIDDEN. The ask is that the
   * switches exist and work, not that the list starts somewhere new.
   */
  const [showClosed, setShowClosed] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  /*
   * Declared here rather than beside the toolbar that also reads it: the
   * filtered empty state (§V2-S13 `11:30`) has to say WHO the assignee filter
   * is set to, and "Me" is the one value it cannot look up in the member list.
   */
  const currentUserId = useAuthStore((state) => state.user?.id) ?? ''
  /*
   * §V2-S13 frame `10:35` — the two rows the Customize panel leads with,
   * "Card size  Medium" and "Card cover  Image". Defaults are the frame's own
   * values. Both live in the saved view's config (see `currentViewConfig`), so
   * the Save-view chip notices them and a view remembers how its board is
   * drawn — a density held only in component state would be a setting that
   * resets on every reload.
   */
  const [cardSize, setCardSize] = useState<CardSize>('medium')
  const [cardCover, setCardCover] = useState<CardCover>('image')
  /*
   * §V2-S13 frame `10:35` — the three switches under Card size and Card cover:
   * `Stack fields` (off), `Show empty fields` (ON), `Collapse empty columns`
   * (off). The defaults are the frame's own positions, read off the toggles.
   *
   * THEY ARE BOARD SWITCHES, and the frames say so rather than the reference
   * documentation. Frame `10:35` is a Board view and offers exactly these
   * three; frame `11:00` is the SAME panel on the List view and offers a
   * different trio — Show task locations · Show subtask parent names · Show
   * closed tasks. So the middle block of this panel depends on the view type,
   * and putting these three on the list would be three labelled switches over
   * a grid that has no cards to stack, no card fields to empty and no columns
   * to collapse.
   *
   * In the saved view's config for the same reason Card size is: a switch held
   * in component state alone resets on every reload, which is the quiet way a
   * control becomes decoration.
   */
  const [stackFields, setStackFields] = useState(false)
  const [showEmptyFields, setShowEmptyFields] = useState(true)
  const [collapseEmptyColumns, setCollapseEmptyColumns] = useState(false)
  /*
   * §V2-07 frame `11:30` — "Tasks where I have assigned": Comments · Subtasks
   * · Checklists, all three drawn ON. They EXTEND the assignee filter rather
   * than being filters of their own, which is why they live beside it and why
   * they do nothing at all while the filter is on "Anyone".
   */
  const [assignedViaComments, setAssignedViaComments] = useState(true)
  const [assignedViaSubtasks, setAssignedViaSubtasks] = useState(true)
  const [assignedViaChecklists, setAssignedViaChecklists] = useState(true)
  // Custom-field column visibility, persisted per saved view (Plan §4/§5).
  const boardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set())
  /*
   * §M frame `12:10` — the Subtasks chip. The reference offers three things and
   * they are not three of a kind: two decide whether the nested rows start
   * open, the third changes the REQUEST, because subtasks-as-rows is a
   * different result set and is also what puts children into filter results.
   *
   * `subtaskStamp` exists because "Expand all" is an ACTION, not a state. A row
   * collapsed by hand must re-expand when the menu item is chosen again, and
   * with a boolean alone that second click changes nothing and reads as a dead
   * control.
   */
  const [subtaskMode, setSubtaskMode] = useState<SubtaskMode>('collapsed')
  const [subtaskStamp, setSubtaskStamp] = useState(0)
  const chooseSubtaskMode = (mode: SubtaskMode) => {
    setSubtaskMode(mode)
    setSubtaskStamp((n) => n + 1)
  }
  const [fieldSearch, setFieldSearch] = useState('')
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomFieldDef['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')
  // The Table "Fields" popover is a native <details>; native <details> doesn't
  // close on an outside click, so wire one up to match the other toolbar popovers.
  const fieldsDetailsRef = useRef<HTMLDetailsElement | null>(null)
  const subtaskDetailsRef = useRef<HTMLDetailsElement | null>(null)
  useDismissableDetails(fieldsDetailsRef)
  useDismissableDetails(subtaskDetailsRef)
  // §V2-07 frame `11:30` — the `⚇ Assignee` picker.
  const assigneeDetailsRef = useRef<HTMLDetailsElement | null>(null)
  useDismissableDetails(assigneeDetailsRef)
  // Board: collapsed columns (ephemeral) + per-status WIP limits (persisted).
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => new Set())
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({})
  /*
   * Which task is open lives in the URL, not in state.
   *
   * `?task=` was declared in validateSearch and consumed on arrival, but
   * nothing ever wrote it — the address scheme was inbound-only. So a task
   * sheet could be opened from a link and never produced one: copying the
   * address bar sent a colleague the list, and a reload closed the sheet. It
   * was also actively wrong once you arrived from search at `?task=A`, closed
   * the sheet and opened task B — the URL still said A, so a reload reopened
   * the task you had moved on from.
   *
   * The server has been minting exactly this URL the whole time
   * (tasks.service.ts buildTaskUrl, and the search indexer), so the format was
   * never in question; only the write was missing.
   *
   * `replace` rather than push, deliberately: the sheet is a view of the list
   * rather than a page of its own, and replacing keeps Back doing what it does
   * today — leaving the list — instead of making the user walk back out
   * through every task they happened to glance at.
   */
  const { task: taskParam, view: viewParam, comment: commentParam } = Route.useSearch()
  const selectedTaskId = taskParam ?? null
  const setSelectedTaskId = (id: string | null) =>
    navigate({
      to: '/app/$workspaceId/$spaceId/$projectId/$listId',
      params: { workspaceId, spaceId, projectId, listId },
      // §V2-S06 — `comment` is dropped on every task change, closing included.
      // It describes an arrival, so keeping it would re-highlight a comment
      // every time the reader came back to that task from somewhere else.
      search: (prev: Record<string, unknown>) => ({ ...prev, task: id ?? undefined, comment: undefined }),
      replace: true,
    })
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [statusManagerOpen, setStatusManagerOpen] = useState(false)
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
  /** §V2-07 — "Sharing & Permissions" on the saved view you are looking at. */
  const [shareViewOpen, setShareViewOpen] = useState(false)
  const [emailAliasOpen, setEmailAliasOpen] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month')
  // Calendar-only assignee filter (Plan §5.3), independent of the shared
  // column filters so it doesn't perturb the List/Table views.
  const [calendarAssignee, setCalendarAssignee] = useState<'all' | string>('all')
  const [calendarDragTaskId, setCalendarDragTaskId] = useState<string | null>(null)
  const [calendarQuickAddDay, setCalendarQuickAddDay] = useState<string | null>(null)
  const [calendarQuickAddTitle, setCalendarQuickAddTitle] = useState('')
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>('')
  const [appliedInitialView, setAppliedInitialView] = useState(false)
  const quickAddRef = useRef<HTMLInputElement | null>(null)

  /*
   * §G01-8 — the list says how old it is, and lets you say how often it looks.
   *
   * It polled on somebody else's schedule with nothing on screen to tell a
   * current board from one that has been sitting there since you made coffee.
   * On a list two people are working through, "is this stale?" is the first
   * question and there was nowhere to look.
   */
  const refresh = useRefreshInterval()
  const { data: tasks = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    // `showArchived` is in the key because it changes WHICH ROWS the server
    // returns — leaving it out would serve the unarchived cache for both
    // states and the toggle would look broken exactly once, on the second use.
    /*
     * `subtaskMode === 'separate'` is in the key for the same reason
     * `showArchived` is, and with the same failure: it changes WHICH ROWS the
     * server returns. The query is also the only reader of `includeSubtasks`,
     * an API option the web app had never once sent — the server has accepted
     * it since the list endpoint was written, so "As separate tasks" was a
     * built, tested, documented parameter that nothing could reach.
     */
    queryKey: ['tasks', listId, showArchived, subtaskMode === 'separate'],
    queryFn: () => {
      const q = new URLSearchParams()
      if (showArchived) q.set('includeArchived', 'true')
      if (subtaskMode === 'separate') q.set('includeSubtasks', 'true')
      const qs = q.toString()
      return api<TaskItem[]>(`/tasks/list/${listId}${qs ? `?${qs}` : ''}`)
    },
    refetchInterval: refresh.refetchInterval,
  })
  const { data: projectFields = [] } = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
  })
  const createField = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: {
          name: newFieldName.trim(),
          type: newFieldType,
          ...(newFieldType === 'dropdown'
            ? {
                options: newFieldOptions
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((label) => ({ label, value: label.toLowerCase().replace(/\s+/g, '-') })),
              }
            : {}),
        },
      }),
    onSuccess: async () => {
      setNewFieldName('')
      setNewFieldType('text')
      setNewFieldOptions('')
      await qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] })
      toast.success(t('list.table.fieldCreated'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('list.table.fieldCreateFailed')),
  })

  const { data: savedViews = [] } = useQuery({
    queryKey: ['list-views', listId],
    queryFn: () =>
      api<
        Array<{
          id: string
          name: string
          type: 'list' | 'board' | 'calendar' | 'gantt' | 'table'
          isDefault?: boolean
          /** §V2-07 — pinned views sort first; the server already ordered them. */
          isPinned?: boolean
          visibility?: 'everyone' | 'private' | 'protected'
          /** This user's own "Autosave for me" flag on this view. */
          autosave?: boolean
          createdById?: string | null
          config?: any
        }>
      >(`/lists/${listId}/views`),
  })
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  })
  const { data: listStatuses = [] } = useQuery({
    queryKey: ['list-statuses', listId],
    queryFn: () => api<ListStatus[]>(`/lists/${listId}/statuses`),
  })
  const { data: listMeta } = useQuery({
    queryKey: ['list-meta', listId],
    queryFn: () => api<{ id: string; name: string; description?: string | null }>(`/lists/${listId}`),
  })
  // A1.10 / A5.4 — the forms filing into this list. ClickUp makes a form a
  // sixth view tab; the cheaper cut A5.4 recommends is simply to say who is
  // writing into the list, since a form was previously invisible from here.
  const { data: listForms = [] } = useQuery({
    queryKey: ['list-forms', workspaceId, listId],
    queryFn: () =>
      api<Array<{ id: string; title: string }>>(`/workspaces/${workspaceId}/forms?listId=${listId}`).catch(() => []),
  })
  // Sibling lists in this project, for the bulk "Move to list" picker (Plan §5.1).
  const { data: projectLists = [] } = useQuery({
    queryKey: ['project-lists', projectId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/lists/project/${projectId}`),
  })

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`list:${listId}`] })
    const onEvent = (event: { type: string; listId?: string; taskId?: string }) => {
      if (event.listId === listId || event.type.startsWith('task.')) {
        void qc.invalidateQueries({ queryKey: ['tasks', listId] })
        if (event.taskId) {
          void qc.invalidateQueries({ queryKey: ['task', event.taskId] })
          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'comments'] })
          void qc.invalidateQueries({ queryKey: ['task', event.taskId, 'activity'] })
        }
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
      socket.emit('unsubscribe', { rooms: [`list:${listId}`] })
    }
  }, [listId, qc])

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return

    try {
      await api('/tasks', {
        method: 'POST',
        // Status intentionally omitted: backend picks the list's first
        // open status, which may differ from the legacy "todo" default.
        body: JSON.stringify(
          buildCreateTaskBody({
            listId,
            title: newTaskTitle,
            priority: newTaskPriority,
            dueDate: newTaskDueDate,
            /*
             * No startDate here on purpose. This row carried a
             * `newTaskStartDate` that nothing was ever bound to: it was
             * declared, sent, and reset, and its value was permanently ''. The
             * API reads '' as "not set", so it did nothing at all — but the
             * code read as though a start date were settable from the quick
             * add, which is the kind of thing someone later wires a bug to.
             * A start date is set in the task sheet, where it can carry a time.
             */
          }),
        ),
      })

      setNewTaskTitle('')
      setNewTaskPriority('normal')
      setNewTaskDueDate('')
      await refetch()
    } catch (error) {
      console.error('Failed to create task', error)
    }
  }

  // Position map keyed by status key, so "sort by status" follows the list's
  // configured status order rather than alphabetical.
  const statusOrder = useMemo(
    () => new Map(listStatuses.map((s) => [s.key, s.position] as const)),
    [listStatuses],
  )

  // Custom-field values cost one request per task, so they are fetched only
  // when something needs them: the Table (which draws them as columns) or a
  // filter rule that names one. Same query key either way, so it is fetched once.
  const needsCustomValues =
    projectFields.length > 0 &&
    (activeView === 'table' ||
      /*
       * Flattened, because a custom-field rule inside a bracket needs the same
       * values as one outside it — reading `.field` off the top level would
       * silently skip the fetch and the rule would then match nothing.
       */
      filterLeaves(filterRules).some((r) => r.field.startsWith('custom:')))
  const { data: customFieldByTask = {} } = useQuery({
    queryKey: ['task-custom-fields-batch', workspaceId, projectId, tasks.map((task) => task.id).join(',')],
    enabled: tasks.length > 0 && needsCustomValues,
    queryFn: async () => {
      const entries = await Promise.all(
        tasks.map(async (task) => {
          const rows = await api<CustomFieldValue[]>(
            `/workspaces/${workspaceId}/tasks/${task.id}/custom-fields`,
          )
          return [task.id, Object.fromEntries(rows.map((r) => [r.definition.id, r.value]))] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, Record<string, unknown>>
    },
  })

  /*
   * §V2-07 frame `11:30` — the rows the three "Tasks where I have assigned"
   * switches ADD to the assignee filter.
   *
   * Only asked when the filter names one real person: "Anyone" is not a
   * narrowing and "Unassigned" is the opposite of an assignment, so in both
   * cases the three switches have nothing to extend and there is nothing to
   * fetch. And only when at least one of them is on, because all three off is
   * the plain assignee filter the client has always done by itself.
   *
   * THE FLAGS ARE IN THE QUERY KEY, not just in the URL. `lib/query.ts` sets
   * `staleTime: 30_000`, so a key that left them out would answer the second
   * combination out of the first one's cache — the switches would appear to
   * work once and then stop, for half a minute, which is the worst shape a bug
   * can have. Each combination is its own key, so every new combination is a
   * real request.
   */
  const assigneeSelected = columnFilters.assignees.length === 1 ? columnFilters.assignees[0] : null
  const assignedViaPerson =
    assigneeSelected && assigneeSelected !== UNASSIGNED_FILTER ? assigneeSelected : null
  const assignedViaAny = assignedViaComments || assignedViaSubtasks || assignedViaChecklists
  const { data: assignedVia } = useQuery({
    queryKey: [
      'list-assigned-via',
      listId,
      assignedViaPerson,
      assignedViaComments,
      assignedViaSubtasks,
      assignedViaChecklists,
    ],
    enabled: !!assignedViaPerson && assignedViaAny,
    queryFn: () =>
      api<{ userId: string; comments: string[]; subtasks: string[]; checklists: string[]; taskIds: string[] }>(
        `/tasks/list/${listId}/assigned-via?userId=${encodeURIComponent(assignedViaPerson ?? '')}` +
          `&comments=${assignedViaComments}&subtasks=${assignedViaSubtasks}&checklists=${assignedViaChecklists}`,
      ),
  })
  /*
   * Rebuilt only when the answer changes, and scoped to the person it was
   * asked about: a set left over from the previous selection would quietly
   * widen the next one, and the rows it added would be somebody else's.
   */
  const assignedViaIds = useMemo(
    () =>
      new Set(
        assignedViaPerson && assignedVia?.userId === assignedViaPerson ? assignedVia.taskIds : [],
      ),
    [assignedVia, assignedViaPerson],
  )

  const visibleTasks = useMemo(() => {
    const filtered = filterTasks(
      tasks,
      statusFilter,
      columnFilters,
      taskSearch,
      filterRules,
      { customFields: projectFields, customValues: customFieldByTask },
      showClosed,
      assignedViaIds,
    )
    // Custom-field sort is resolved inside TableView (it owns the values); for
    // every other view a custom sort is a stable no-op here.
    return sortTasks(filtered, sort, statusOrder)
  }, [tasks, statusFilter, columnFilters, taskSearch, filterRules, projectFields, customFieldByTask, sort, statusOrder, showClosed, assignedViaIds])

  /*
   * §V2-S13 frame `11:30` — THE CONFIDENT ZERO.
   *
   * The frame's empty body reads "You don't have any tasks assigned to you."
   * over "To see all tasks, <u>turn off Me Mode.</u>" — it names the filter
   * that emptied the list and links the way back. Rundesk branched on
   * `visibleTasks.length === 0` alone and printed "No tasks yet / press C to
   * add the first" with a Create task button, so a list of five hundred tasks
   * with one unmatched word in the in-list search reported itself as empty and
   * invited you to make the first one. The verdict "there is nothing here" was
   * read off the FILTERED set and stated as a fact about the LIST.
   *
   * `activeNarrowings` is the difference. Every axis that can hide a row is
   * enumerated once, with the label the empty state will say and the undo it
   * will run, so "which filter did this" and "what does Clear undo" cannot
   * drift apart — two lists would be two things to keep in step, and the one
   * that drifted would be the one nobody reads.
   *
   * `showArchived` is deliberately NOT here: it is a server parameter, so with
   * it off the archived rows are not in `tasks` at all and the list is
   * genuinely empty as far as this screen is concerned. `showClosed` IS here,
   * because closed tasks arrive and are then hidden on the client.
   */
  const activeNarrowings = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = []
    if (taskSearch.trim()) {
      out.push({
        key: 'search',
        label: t('list.empty.filterSearch', { term: taskSearch.trim() }),
        clear: () => setTaskSearch(''),
      })
    }
    if (statusFilter !== 'all') {
      out.push({
        key: 'status',
        label: t('list.empty.filterStatus', {
          value: resolveStatusLabel(statusFilter, listStatuses.find((s) => s.key === statusFilter)?.name ?? statusFilter, t),
        }),
        clear: () => setStatusFilter('all'),
      })
    }
    if (columnFilters.statuses.length > 0) {
      out.push({
        key: 'columnStatuses',
        label: t('list.empty.filterColumnStatus', { count: columnFilters.statuses.length }),
        clear: () => setColumnFilters((f) => ({ ...f, statuses: [] })),
      })
    }
    if (columnFilters.priorities.length > 0) {
      out.push({
        key: 'priorities',
        label: t('list.empty.filterPriority', { count: columnFilters.priorities.length }),
        clear: () => setColumnFilters((f) => ({ ...f, priorities: [] })),
      })
    }
    if (columnFilters.assignees.length > 0) {
      const only = columnFilters.assignees.length === 1 ? columnFilters.assignees[0] : null
      const who =
        only === UNASSIGNED_FILTER
          ? t('list.group.unassigned')
          : only === currentUserId
            ? t('list.assigneeMe')
            : only
              ? workspaceMembers.find((m) => m.userId === only)?.displayName ?? t('list.empty.filterAssigneeSome')
              : t('list.empty.filterAssigneeSome')
      out.push({
        key: 'assignees',
        label: t('list.empty.filterAssignee', { value: who }),
        clear: () => setColumnFilters((f) => ({ ...f, assignees: [] })),
      })
    }
    if (filterRules.length > 0) {
      out.push({
        key: 'rules',
        label: t('list.empty.filterRules', { count: filterLeaves(filterRules).length }),
        clear: () => setFilterRules([]),
      })
    }
    if (!showClosed) {
      out.push({ key: 'closed', label: t('list.empty.filterClosed'), clear: () => setShowClosed(true) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskSearch, statusFilter, columnFilters, filterRules, showClosed, listStatuses, workspaceMembers, currentUserId, locale])

  /** A filter emptied this list, as opposed to the list being empty. */
  const emptiedByFilter = tasks.length > 0 && visibleTasks.length === 0

  /** Every narrowing undone at once — the frame's "turn off Me Mode" link. */
  const clearAllNarrowings = () => {
    for (const n of activeNarrowings) n.clear()
  }

  // Toggle direction when re-clicking the active column, else adopt the
  // field's natural default direction.
  const handleSort = (field: SortField) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: defaultSortDir(field) }))

  const tasksByStatus = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const s of listStatuses) map[s.key] = []
    for (const task of visibleTasks) {
      if (!map[task.status]) map[task.status] = []
      map[task.status].push(task)
    }
    return map
  }, [visibleTasks, listStatuses])

  const tasksByDate = useMemo(() => {
    // Calendar carries its own assignee filter (Plan §5.3) on top of the
    // shared status/column filters already baked into visibleTasks.
    const source =
      calendarAssignee === 'all'
        ? visibleTasks
        : visibleTasks.filter((task) => (task.assignees ?? []).some((a) => a.userId === calendarAssignee))
    const map = new Map<string, TaskItem[]>()
    for (const task of source) {
      const key = task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : 'No due date'
      const arr = map.get(key) ?? []
      arr.push(task)
      map.set(key, arr)
    }
    return Array.from(map.entries())
  }, [visibleTasks, calendarAssignee])

  /*
   * The effect that used to copy `?task=` into state is gone: the search
   * param IS the state now, so mirroring it into a second copy could only
   * reintroduce the drift it was written to paper over.
   */

  const applyView = (viewId: string) => {
    const view = savedViews.find((v) => v.id === viewId)
    if (!view) return
    const cfg = view.config ?? {}
    setSelectedSavedViewId(view.id)
    setActiveView(view.type)
    setStatusFilter((cfg.statusFilter as 'all' | TaskStatus) ?? 'all')
    // Prefer the new {field,dir} sort; fall back to the legacy sortBy string
    // so views saved before per-column sort still apply cleanly.
    if (cfg.sort && typeof cfg.sort === 'object') {
      setSort({ field: (cfg.sort.field as SortField) ?? 'created', dir: (cfg.sort.dir as SortDir) ?? 'desc' })
    } else {
      const legacy = (cfg.sortBy as SortField) ?? 'created'
      setSort({ field: legacy, dir: defaultSortDir(legacy) })
    }
    setColumnFilters(
      cfg.columnFilters && typeof cfg.columnFilters === 'object'
        ? {
            statuses: Array.isArray(cfg.columnFilters.statuses) ? (cfg.columnFilters.statuses as string[]) : [],
            priorities: Array.isArray(cfg.columnFilters.priorities) ? (cfg.columnFilters.priorities as TaskPriority[]) : [],
            assignees: Array.isArray(cfg.columnFilters.assignees) ? (cfg.columnFilters.assignees as string[]) : [],
          }
        : EMPTY_COLUMN_FILTERS,
    )
    // Views saved before the filter builder simply carry no rules.
    /*
     * A view saved before brackets existed holds a flat `FilterRule[]`, which
     * is a valid `FilterNode[]` — every leaf is a node. Nothing to migrate.
     */
    setFilterRules(Array.isArray(cfg.filterRules) ? (cfg.filterRules as FilterNode[]) : [])
    setGroupBy((cfg.groupBy as 'status' | 'priority' | 'assignee') ?? 'status')
    setHiddenFields(new Set(Array.isArray(cfg.hiddenFields) ? (cfg.hiddenFields as string[]) : []))
    /*
     * Through `chooseSubtaskMode`, not the setter: applying a view has to bump
     * the stamp too, or the rows keep whatever they were expanded to and the
     * view remembers a setting the screen does not show.
     */
    const savedSubtaskMode = cfg.subtaskMode as SubtaskMode | undefined
    chooseSubtaskMode(
      savedSubtaskMode === 'expanded' || savedSubtaskMode === 'separate' ? savedSubtaskMode : 'collapsed',
    )
    setWipLimits(cfg.wipLimits && typeof cfg.wipLimits === 'object' ? (cfg.wipLimits as Record<string, number>) : {})
    // §V2-S13 `10:35` — a view saved before these existed carries neither, and
    // falls back to the frame's defaults rather than to `undefined`.
    setCardSize(CARD_SIZES.includes(cfg.cardSize as CardSize) ? (cfg.cardSize as CardSize) : 'medium')
    setCardCover(CARD_COVERS.includes(cfg.cardCover as CardCover) ? (cfg.cardCover as CardCover) : 'image')
    /*
     * §V2-S13 `10:35` / §V2-07 `11:30` — restored, not left at the defaults.
     * `viewDirty` compares the live config against the fingerprint taken right
     * after this runs, so a key that is SAVED and not APPLIED would light the
     * Save-view chip the instant a view was opened, on a view nobody had
     * touched. `??` rather than `||`, because `false` is a real saved value.
     */
    setStackFields(typeof cfg.stackFields === 'boolean' ? cfg.stackFields : false)
    setShowEmptyFields(typeof cfg.showEmptyFields === 'boolean' ? cfg.showEmptyFields : true)
    setCollapseEmptyColumns(typeof cfg.collapseEmptyColumns === 'boolean' ? cfg.collapseEmptyColumns : false)
    const via = (cfg.assignedVia ?? {}) as Record<string, unknown>
    setAssignedViaComments(typeof via.comments === 'boolean' ? via.comments : true)
    setAssignedViaSubtasks(typeof via.subtasks === 'boolean' ? via.subtasks : true)
    setAssignedViaChecklists(typeof via.checklists === 'boolean' ? via.checklists : true)
    setViewStamp((n) => n + 1)
  }

  // Everything a named view remembers. One place, so "save as" and "update"
  // can never drift apart.
  const currentViewConfig = () => ({
    activeView,
    statusFilter,
    sort,
    columnFilters,
    filterRules,
    groupBy,
    hiddenFields: Array.from(hiddenFields),
    subtaskMode,
    wipLimits,
    // §V2-S13 `10:35` — Card size and Card cover belong to the VIEW, which is
    // what the panel they sit in configures. Carried here so changing one
    // lights the Save-view chip and `updateSavedView` persists it.
    cardSize,
    cardCover,
    // §V2-S13 `10:35` — the three board switches, for the same reason as the
    // two rows above them: the panel configures the VIEW, so the view has to
    // remember what the panel was set to.
    stackFields,
    showEmptyFields,
    collapseEmptyColumns,
    // §V2-07 `11:30` — grouped, because they are three settings of one filter
    // rather than three independent ones, and a saved view that restored two
    // of them would be a filter that came back meaning something else.
    assignedVia: {
      comments: assignedViaComments,
      subtasks: assignedViaSubtasks,
      checklists: assignedViaChecklists,
    },
  })

  /*
   * §V2-07 `[11:35]` / frame `11:41` — the "Save view" chip.
   *
   * The frame shows it appearing, highlighted, once the view has been changed:
   * an unsaved-state affordance. Rundesk had none. You could change the
   * filters, the sort, the grouping and the columns, walk away, and come back
   * to find them gone — with nothing having said they were temporary, and
   * "Update view" buried in a … menu on the tab.
   *
   * `hiddenFields` is a Set flattened to an array, so its ORDER carries no
   * meaning; sorting before comparing stops the chip lighting up because two
   * identical sets happened to iterate differently.
   */
  const configFingerprint = (cfg: ReturnType<typeof currentViewConfig>) =>
    JSON.stringify({ ...cfg, hiddenFields: [...cfg.hiddenFields].sort() })
  /*
   * STATE, not a ref. The first version held this in a ref, and the chip then
   * stayed up after a successful save: `viewDirty` is computed during render,
   * the stamping effect runs after it, and updating a ref re-renders nothing —
   * so the screen kept the value from before the save. `list-save-view.mjs`
   * failed on exactly that, which is why its last check exists.
   */
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)
  /*
   * A counter rather than a ref flag, so the stamping effect ALWAYS runs.
   * With a flag, applying a view whose config happened to equal the current
   * state would re-render nothing, the effect would not fire, and the stamp
   * would land later — on a config the person had since changed, which is the
   * one state where the chip must be lit and would not be.
   */
  const [viewStamp, setViewStamp] = useState(0)
  useEffect(() => {
    setSavedFingerprint(configFingerprint(currentViewConfig()))
    // Runs after the setters in applyView/create/update have flushed, so it
    // fingerprints the settled config rather than the one before them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStamp])
  const viewDirty =
    savedFingerprint !== null && savedFingerprint !== configFingerprint(currentViewConfig())

  const refreshSavedViews = () => qc.invalidateQueries({ queryKey: ['list-views', listId] })

  const createSavedView = async () => {
    const name = window.prompt(t('list.viewNamePrompt'))?.trim()
    if (!name) return
    const created = await api<{ id: string }>(`/lists/${listId}/views`, {
      method: 'POST',
      body: JSON.stringify({ name, type: activeView, config: currentViewConfig() }),
    })
    await refreshSavedViews()
    setSelectedSavedViewId(created.id)
    setViewStamp((n) => n + 1)
  }

  const renameSavedView = async (viewId: string, currentName: string) => {
    const name = window.prompt(t('list.viewRenamePrompt'), currentName)?.trim()
    if (!name || name === currentName) return
    await api(`/views/${viewId}`, { method: 'PATCH', body: { name } })
    await refreshSavedViews()
  }

  const updateSavedView = async (viewId: string) => {
    await api(`/views/${viewId}`, { method: 'PATCH', body: { config: currentViewConfig() } })
    await refreshSavedViews()
    setViewStamp((n) => n + 1)
    toast.success(t('list.viewUpdated'))
  }

  const makeSavedViewDefault = async (viewId: string) => {
    await api(`/views/${viewId}`, { method: 'PATCH', body: { isDefault: true } })
    await refreshSavedViews()
  }

  /** The saved view the tab strip is currently on, if it is on one at all. */
  const selectedSavedView = savedViews.find((v) => v.id === selectedSavedViewId)

  /*
   * §V2-07 — every switch in the Customize panel that belongs to the VIEW
   * rather than to this screen: Pin view, Private view, Protect view, Set as
   * default view. One writer, because the server refuses some combinations
   * (a private view cannot be the list's default) and a second copy of this
   * would be a second place for that message to go missing.
   */
  const patchSavedView = async (patch: Record<string, unknown>) => {
    if (!selectedSavedView) return
    try {
      await api(`/views/${selectedSavedView.id}`, { method: 'PATCH', body: patch })
      await refreshSavedViews()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('list.view.changeFailed'))
    }
  }

  /* "Autosave for me" is this user's own flag, so it has its own route. */
  const setViewAutosave = async (autosave: boolean) => {
    if (!selectedSavedView) return
    try {
      await api(`/views/${selectedSavedView.id}/autosave`, { method: 'PATCH', body: { autosave } })
      await refreshSavedViews()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('list.view.changeFailed'))
    }
  }

  /*
   * "Copy link to view". Built from the current location so it carries whatever
   * host the person is actually on — a hard-coded origin is how a copied link
   * ends up pointing at somebody else's deployment.
   */
  const copyViewLink = async () => {
    if (!selectedSavedView) return
    const url = `${window.location.origin}${window.location.pathname}?view=${selectedSavedView.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('list.view.linkCopied'))
    } catch {
      // A denied clipboard permission is common and is not an error the person
      // can act on — show them the link so they can copy it themselves.
      window.prompt(t('list.view.copyLinkManually'), url)
    }
  }

  const deleteSavedView = async (viewId: string) => {
    await api(`/views/${viewId}`, { method: 'DELETE' })
    if (selectedSavedViewId === viewId) setSelectedSavedViewId('')
    await refreshSavedViews()
  }

  useEffect(() => {
    if (appliedInitialView || savedViews.length === 0) return
    /*
     * §V2-07 — a `?view=` in the URL is somebody having used "Copy link to
     * view", so it wins over the list's default. A link to a view that has
     * since been deleted, or to somebody's PRIVATE view (which the server does
     * not return to this user at all), falls through to the default rather
     * than showing an empty list with no explanation.
     */
    const linked = viewParam ? savedViews.find((v) => v.id === viewParam) : undefined
    const target = linked ?? savedViews.find((v) => v.isDefault) ?? savedViews[0]
    if (target) applyView(target.id)
    setAppliedInitialView(true)
  }, [appliedInitialView, savedViews, viewParam])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault()
        quickAddRef.current?.focus()
      }
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault()
        // Cycle only through the views this space enables (§5 per-space config),
        // so the shortcut can never land on a hidden view.
        //
        // `ALL_VIEWS`, NOT A SIXTH COPY OF THE VIEW KEYS. This read
        // `['list', 'board', 'table', 'calendar', 'gantt']` — the same five
        // names `ALL_VIEWS` holds eight hundred lines above, minus `team`. So
        // Team View, built during this audit and drawn in the tab strip, could
        // not be reached by the keyboard at all: `v` walked past it forever.
        // The keys now exist four times rather than five (`space-presets.ts` is
        // the source of truth, `lib/space-views.ts` and `ALL_VIEWS` are the
        // other two), and this site holds none of its own.
        const order: Array<typeof activeView> = (ALL_VIEWS as readonly string[] as Array<typeof activeView>)
          .filter((v) => enabledViewsRef.current.includes(v))
        if (order.length === 0) return
        const idx = order.indexOf(activeView)
        setActiveView(order[(idx + 1) % order.length])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeView])

  const calendarDays = useMemo(() => {
    const days: Date[] = []
    if (calendarView === 'week') {
      const weekStart = startOfWeek(calendarMonth, { weekStartsOn: 1 })
      for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))
      return days
    }
    const monthStart = startOfMonth(calendarMonth)
    const monthEnd = endOfMonth(calendarMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    let cur = gridStart
    while (cur <= gridEnd) {
      days.push(cur)
      cur = addDays(cur, 1)
    }
    return days
  }, [calendarMonth, calendarView])

  /*
   * §V2-S13 frame `09:35` — what the Today button acts on, and what says
   * whether it did anything.
   *
   * The period key is the VIEWPORT's identity — the ISO date of the week's
   * Monday, or `yyyy-MM` for a month — so "the calendar moved" is a comparison
   * of two strings rather than of what the heading happens to render in the
   * current locale. `calendarOnToday` is the same key computed for now, which
   * is also exactly the condition under which Today has nothing to do.
   */
  const calendarPeriodKey =
    calendarView === 'week'
      ? format(startOfWeek(calendarMonth, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      : format(startOfMonth(calendarMonth), 'yyyy-MM')
  const calendarTodayKey =
    calendarView === 'week'
      ? format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      : format(startOfMonth(new Date()), 'yyyy-MM')
  const calendarOnToday = calendarPeriodKey === calendarTodayKey

  // Reschedule a task's due date onto a calendar day (drag-drop / click-create).
  const rescheduleTask = async (taskId: string, day: Date) => {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ dueDate: format(day, 'yyyy-MM-dd') }),
    })
    await refetch()
  }
  // Shift a task's whole span by `deltaDays` (Gantt bar drag, Plan §5.4). Reuses
  // the same PATCH /tasks/:id path as the calendar reschedule above, moving
  // whichever of start/due the task actually has so the duration is preserved.
  const rescheduleTaskSpan = async (task: TaskItem, deltaDays: number) => {
    if (deltaDays === 0) return
    const patch: Record<string, string> = {}
    if (task.startDate) patch.startDate = format(addDays(new Date(task.startDate), deltaDays), 'yyyy-MM-dd')
    if (task.dueDate) patch.dueDate = format(addDays(new Date(task.dueDate), deltaDays), 'yyyy-MM-dd')
    if (Object.keys(patch).length === 0) return
    await api(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    await refetch()
  }
  const createTaskOnDay = async (day: Date, title: string) => {
    await api('/tasks', {
      method: 'POST',
      body: JSON.stringify(buildCreateTaskBody({ listId, title, dueDate: format(day, 'yyyy-MM-dd') })),
    })
    await refetch()
  }

  const draggingTask = useMemo(
    () => tasks.find((task) => task.id === draggingTaskId) ?? null,
    [tasks, draggingTaskId],
  )

  const moveTaskStatus = async (taskId: string, status: TaskStatus) => {
    await api(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    await refetch()
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('task:')) {
      setDraggingTaskId(id.replace('task:', ''))
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null
    const activeId = String(event.active.id)
    setDraggingTaskId(null)
    if (!overId || !activeId.startsWith('task:') || !overId.startsWith('status:')) return
    const taskId = activeId.replace('task:', '')
    const nextStatus = overId.replace('status:', '') as TaskStatus
    const task = tasks.find((task) => task.id === taskId)
    if (!task || task.status === nextStatus) return
    try {
      await moveTaskStatus(taskId, nextStatus)
    } catch (error) {
      console.error('Failed to move task status', error)
    }
  }

  // A1.2 — the named views the user saved sit in the same strip as the built-in
  // types, which is where ClickUp puts them ("Team View" *is* a tab). Selecting
  // a type tab drops out of the named view, so the ⋯ actions can never write
  // back to a view you have already navigated away from.
  const viewTabs: WorkViewTab[] = [
    ...(
      [
        { id: 'list', label: t('list.viewList') },
        { id: 'board', label: t('list.viewBoard') },
        { id: 'table', label: t('list.viewTable') },
        { id: 'calendar', label: t('list.viewCalendar') },
        { id: 'gantt', label: t('list.viewGantt') },
        // §V2-13, frames `07:40` / `09:25` — work by the person doing it.
        { id: 'team', label: t('list.viewTeam') },
      ] as { id: typeof activeView; label: string }[]
    )
      .filter((tb) => enabledViews.includes(tb.id))
      .map((tb) => ({
        key: `type:${tb.id}`,
        label: tb.label,
        active: !selectedSavedViewId && activeView === tb.id,
        onSelect: () => {
          /*
           * §V2-13 `[09:26]` "TEAM VIEW — yeh cheez ke liye humein of course
           * BUY karna parega". Pressing the tab on a plan that does not
           * include it opens the paywall and LEAVES YOU WHERE YOU WERE, which
           * is what the frame shows: the modal is over the list she was on.
           */
          if (tb.id === 'team' && !requireFeature(TEAM_VIEW_GATE)) return
          setActiveView(tb.id)
          setSelectedSavedViewId('')
        },
      })),
    ...savedViews.map((view) => ({
      key: `view:${view.id}`,
      label: view.isDefault ? `★ ${view.name}` : view.name,
      active: selectedSavedViewId === view.id,
      onSelect: () => applyView(view.id),
      action: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mr-1 rounded p-0.5 text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
              aria-label={t('list.viewActions', { name: view.name })}
              title={t('list.viewActions', { name: view.name })}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => void updateSavedView(view.id)}>
              {t('list.viewUpdate')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void renameSavedView(view.id, view.name)}>
              {t('list.viewRename')}
            </DropdownMenuItem>
            {!view.isDefault && (
              <DropdownMenuItem onClick={() => void makeSavedViewDefault(view.id)}>
                {t('list.viewDefault')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-rose-600 dark:text-rose-400"
              onClick={() => void deleteSavedView(view.id)}
            >
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    })),
  ]

  /*
   * §V2-07 — the option lists the Filters panel needs.
   *
   * Tags come from the tasks already on screen rather than from a workspace
   * label query: a tag no task in this list carries would filter to nothing,
   * so offering it would be an option that can only disappoint.
   */
  const labelOptions: FilterOption[] = useMemo(() => {
    const seen = new Map<string, string>()
    for (const task of tasks) for (const l of task.labels ?? []) seen.set(l.id, l.name)
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [tasks])
  const filterStatusOptions: FilterOption[] = useMemo(
    () =>
      (listStatuses.length
        ? listStatuses
        : Object.entries(DEFAULT_STATUS_META).map(([k, m]) => ({ key: k, name: m.label }))
      ).map((st) => ({ value: st.key, label: resolveStatusLabel(st.key, st.name, t) })),
    [listStatuses, t],
  )
  /*
   * §V2-06 — the space's ClickApps, frame `07:19`. Reads the same
   * `['spaces', workspaceId]` cache this route already keeps for `viewConfig`,
   * so it costs no extra request. Everything is ON until a space says
   * otherwise, including while that query loads.
   */
  const spaceFeatures = useSpaceFeatures(workspaceId, spaceId)

  const statusOptions = listStatuses.length
    ? listStatuses
    : Object.entries(DEFAULT_STATUS_META).map(([k, m]) => ({ key: k, name: m.label }))

  // The Board renders one column per list status; a list with no status rows
  // (e.g. seeded outside the API) must still get the default columns.
  const boardStatuses: ListStatus[] = listStatuses.length
    ? listStatuses
    : Object.entries(DEFAULT_STATUS_META).map(([k, m], i) => ({
        id: k,
        listId,
        key: k,
        name: m.label,
        color: m.color,
        category:
          k === 'done' || k === 'cancelled'
            ? 'closed'
            : k === 'in_progress' || k === 'in_review'
              ? 'in_progress'
              : 'open',
        position: i,
      }))

  return (
    <ListStatusesContext.Provider value={listStatuses}>
    <SpaceFeaturesContext.Provider value={spaceFeatures}>
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0f1114]">
      <TaskListChrome
        listName={listMeta?.name ?? t('list.defaultListName')}
        taskCount={visibleTasks.length}
        freshness={
          <FreshnessControls
            refreshMs={refresh.refreshMs}
            onRefreshMsChange={refresh.setRefreshMs}
            dataUpdatedAt={dataUpdatedAt}
            onRefreshNow={() => void refetch()}
            busy={isLoading}
          />
        }
        headerAction={
          // A1.8 — sharing a list was already implemented; it was only
          // reachable from the sidebar row menu, never from the list itself.
          <button
            type="button"
            onClick={() => setSharePanelOpen(true)}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-card px-2 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            title={t('list.shareButton')}
          >
            <Share2 className="h-3.5 w-3.5" />
            {t('list.shareButton')}
          </button>
        }
        secondaryAction={
          listForms.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{t('list.fedByForms')}</span>
              {listForms.map((form) => (
                <Link
                  key={form.id}
                  to="/app/$workspaceId/forms/$formId"
                  params={{ workspaceId, formId: form.id }}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-card px-2 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span className="max-w-[10rem] truncate">{form.title}</span>
                </Link>
              ))}
            </div>
          ) : null
        }
        quickAdd={
          <>
            <Input
              ref={quickAddRef}
              placeholder={t('list.quickAdd')}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              className="h-8 w-full sm:w-64 text-[13px] border-border/80 focus-visible:ring-violet-500/25"
            />
            <WorkFilterSelect
              value={newTaskPriority}
              onChange={(v) => setNewTaskPriority(v as TaskPriority)}
              className="h-8 capitalize"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {t(PRIORITY_LABEL_KEYS[p])}
                </option>
              ))}
            </WorkFilterSelect>
            <Input
              type="date"
              value={newTaskDueDate}
              onChange={(e) => setNewTaskDueDate(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
              title={t('list.sortDueDate')}
              className="h-8 w-[9.5rem] text-[13px] border-border/80 focus-visible:ring-violet-500/25"
            />
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleCreateTask}>
              {t('list.addTask')}
            </Button>
          </>
        }
        viewTabs={
          <WorkViewTabs
            tabs={viewTabs}
            trailing={
              <button
                type="button"
                onClick={() => void createSavedView()}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('list.addView')}
              </button>
            }
          />
        }
        toolbar={
          <>
            {/*
              §V2-07 `[11:35]` — the chip only exists while there is something
              to save, which is what makes its presence the message. On a saved
              view it updates that view; on a built-in tab there is nothing to
              update, so it offers to save what you have built as a new one.
            */}
            {viewDirty && (
              <button
                type="button"
                data-testid="list-save-view"
                onClick={() =>
                  selectedSavedViewId
                    ? void updateSavedView(selectedSavedViewId)
                    : void createSavedView()
                }
                className="h-8 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 text-[12px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              >
                {t(selectedSavedViewId ? 'list.saveView' : 'list.saveAsView')}
              </button>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder={t('list.searchTasks')}
                /*
                 * Addressable, because a suite that wants to talk about ITS OWN
                 * rows in a shared list needs a way to be left with only those.
                 * Past a few hundred rows the status group virtualises and a
                 * row created at the end is not in the DOM at all, which reads
                 * exactly like the feature being broken.
                 */
                data-testid="list-task-search"
                aria-label={t('list.searchTasks')}
                className="h-8 w-40 rounded-md border border-border/80 bg-card pl-7 pr-6 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25"
              />
              {taskSearch && (
                <button
                  type="button"
                  onClick={() => setTaskSearch('')}
                  aria-label={t('list.clearSearch')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>
            <WorkFilterSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as 'all' | TaskStatus)}
            >
              <option value="all">{t('list.allStatuses')}</option>
              {statusOptions.map((status) => (
                <option key={status.key} value={status.key}>
                  {resolveStatusLabel(status.key, status.name, t)}
                </option>
              ))}
            </WorkFilterSelect>
            <FilterBuilderMenu
              listId={listId}
              nodes={filterRules}
              onChange={setFilterRules}
              customFields={projectFields}
              workspaceMembers={workspaceMembers}
              statusOptions={filterStatusOptions}
              labelOptions={labelOptions}
              /*
               * §V2-06 — a filter on a field the space has switched off would
               * narrow the list by something nothing on it displays, which
               * reads as "the list is broken" rather than "that is filtered".
               */
              hiddenFields={[
                ...(spaceFeatures.priority ? [] : ['priority']),
                ...(spaceFeatures.tags ? [] : ['tags']),
              ]}
            />
            {/*
              §V2-07 `[11:28]` — "ASSIGNEE — aap ko ya aap ke alawa [kisi aur
              ko] — agar aap ko rakhna hai to aap rakh sakte ho." Frame `11:41`
              has it as a toolbar chip beside Filter and Closed.

              It writes into `columnFilters.assignees`, the set the column
              funnel already uses, rather than carrying its own state: two
              controls for one filter is how they end up disagreeing about
              what is on screen.
            */}
            <div className="flex shrink-0 items-center gap-1.5" data-testid="list-assignee-cluster">
              <AssigneePicker
                detailsRef={assigneeDetailsRef}
                members={workspaceMembers}
                currentUserId={currentUserId}
                selected={columnFilters.assignees}
                onSelect={(v) => setColumnFilters((f) => ({ ...f, assignees: v ? [v] : [] }))}
                assignedViaOn={!!assignedViaPerson}
                comments={assignedViaComments}
                onComments={setAssignedViaComments}
                subtasks={assignedViaSubtasks}
                onSubtasks={setAssignedViaSubtasks}
                checklists={assignedViaChecklists}
                onChecklists={setAssignedViaChecklists}
              />
            {/*
              THE NATIVE SELECT STAYS, beside the picker rather than under it.

              Same argument the field-type picker settled on when its search
              box went in: a `<select>` is what a screen reader announces, what
              a phone renders as a full-height wheel, and what a suite can
              drive with `selectOption`. The frame's control is the faces —
              which is the half that was missing, because a collapsed select
              cannot show you WHO — and the two are one filter, not two: both
              read and write `columnFilters.assignees`, so there is no second
              state for them to disagree about.
            */}
            <WorkFilterSelect
              value={columnFilters.assignees.length === 1 ? columnFilters.assignees[0] : ''}
              onChange={(v) =>
                setColumnFilters((f) => ({ ...f, assignees: v ? [v] : [] }))
              }
              testId="list-assignee-filter"
              ariaLabel={t('taskDetail.fieldAssignees')}
            >
              <option value="">{t('list.assigneeAnyone')}</option>
              {currentUserId && <option value={currentUserId}>{t('list.assigneeMe')}</option>}
              <option value={UNASSIGNED_FILTER}>{t('list.group.unassigned')}</option>
              {workspaceMembers
                .filter((m) => m.userId !== currentUserId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                ))}
            </WorkFilterSelect>
            </div>
            <WorkFilterSelect
              value={sort.field.startsWith('custom:') ? 'created' : sort.field}
              onChange={(v) => setSort((s) => ({ field: v as SortField, dir: s.field === v ? s.dir : defaultSortDir(v as SortField) }))}
            >
              <option value="created">{t('list.sortCreated')}</option>
              <option value="due">{t('list.sortDueDate')}</option>
              {spaceFeatures.priority && <option value="priority">{t('list.sortPriority')}</option>}
              <option value="title">{t('list.table.colTitle')}</option>
              <option value="status">{t('taskDetail.fieldStatus')}</option>
              <option value="assignee">{t('taskDetail.fieldAssignees')}</option>
            </WorkFilterSelect>
            <button
              type="button"
              onClick={() => setSort((s) => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}
              className="h-8 w-8 shrink-0 rounded-md border border-border/80 bg-card text-[13px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label={t(sort.dir === 'asc' ? 'list.sortAscAria' : 'list.sortDescAria')}
              title={t(sort.dir === 'asc' ? 'list.sortAscAria' : 'list.sortDescAria')}
            >
              {sort.dir === 'asc' ? '↑' : '↓'}
            </button>
            {/*
              §M frame `12:10` — THE THREE CHIPS, AS ONE CLUSTER.

              Zoomed, the frame shows three rounded pills abreast with nothing
              between them: `≋ Group: Status` (tinted, because grouping is on),
              `⑂ Subtasks`, `▥ Columns`.

              The cluster is a container rather than three loose controls, and
              that is measured rather than decorative. Rundesk's list toolbar
              also carries Search, Filter, Sort, Closed, Archived, Customize,
              Statuses and Email, so at 1600px it wraps — and loose, the wrap
              lands BETWEEN Group and Subtasks with every chip present and
              correct. Adjacent in the markup AND one flex item is what keeps
              the wrap outside the cluster.
            */}
            <div className="flex shrink-0 items-center gap-2" data-testid="list-view-controls">
            {/*
              The first chip NAMES ITS CURRENT VALUE. Rundesk's said "By
              status", which is the same information in a form that takes a
              moment longer to read and does not say what the control is. The
              relabelling is in the catalogue, so the option list and the
              collapsed chip can never drift.

              Still a native <select>: keyboard- and screen-reader-complete for
              free, and three suites already drive it by `list-group-by`. The
              icon is drawn behind it and the padding makes room, which is the
              one thing a bare select cannot host.
            */}
            <span className="relative inline-flex shrink-0 items-center" data-testid="list-group-chip">
              <Layers className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-accent" aria-hidden />
              <WorkFilterSelect
                value={groupBy}
                onChange={(v) => setGroupBy(v as typeof groupBy)}
                testId="list-group-by"
                ariaLabel={t('list.groupByStatus')}
                className="rounded-full border-accent/50 bg-accent/10 pl-7 text-accent"
              >
                <option value="status">{t('list.groupByStatus')}</option>
                {/* Grouping by a field the space has switched off would produce
                    buckets for something nothing displays. */}
                {spaceFeatures.priority && <option value="priority">{t('list.groupByPriority')}</option>}
                <option value="assignee">{t('list.groupByAssignee')}</option>
              </WorkFilterSelect>
            </span>

            {/*
              The Subtasks chip. Only on the two views that DRAW a subtask: the
              board's cards carry a done/total badge and no tree, and the
              calendar has no rows, so offering it there would be a switch with
              nowhere to land.
            */}
            {(activeView === 'table' || activeView === 'list') && (
              /* `data-mode` on the <details>, not on its <summary>: the
                 <details> is the element every check addresses, and an
                 attribute a check cannot reach from the handle it holds is an
                 attribute nobody reads. */
              <details ref={subtaskDetailsRef} className="relative" data-testid="list-subtasks" data-mode={subtaskMode}>
                <summary
                  className={cn(
                    'list-none h-8 px-2.5 flex items-center gap-1.5 rounded-full border text-[12px] cursor-pointer select-none',
                    subtaskMode === 'collapsed'
                      ? 'border-border/80 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      : 'border-accent/50 bg-accent/10 text-accent',
                  )}
                  title={t('list.subtasks.modeAria')}
                >
                  <GitBranch className="h-3.5 w-3.5" aria-hidden />
                  {t('list.subtasks.chip')}
                </summary>
                <div
                  className="absolute z-20 mt-1 w-60 rounded-md border border-border bg-card p-1 shadow-lg"
                  role="radiogroup"
                  aria-label={t('list.subtasks.modeAria')}
                >
                  {([
                    ['collapsed', 'list.subtasks.collapseAll', undefined],
                    ['expanded', 'list.subtasks.expandAll', undefined],
                    ['separate', 'list.subtasks.asSeparate', 'list.subtasks.asSeparateHint'],
                  ] as const).map(([mode, labelKey, hintKey]) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={subtaskMode === mode}
                      data-testid={`list-subtasks-${mode}`}
                      onClick={() => {
                        chooseSubtaskMode(mode)
                        /* Collapse all and Expand all are ACTIONS — the menu is
                           done once one is chosen, and leaving it open over the
                           rows it just changed hides the result. */
                        if (subtaskDetailsRef.current) subtaskDetailsRef.current.open = false
                      }}
                      className={cn(
                        'w-full flex items-start gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted/40',
                        subtaskMode === mode && 'text-accent',
                      )}
                    >
                      <Check
                        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', subtaskMode === mode ? 'opacity-100' : 'opacity-0')}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        {t(labelKey)}
                        {hintKey && (
                          <span className="block text-[11px] text-muted-foreground">{t(hintKey)}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}

            {(activeView === 'table' || activeView === 'list') && (
              /*
                The Columns chip. It was a "Fields (n/m)" box that could hide
                only CUSTOM fields, so the columns every list has were the ones
                you could not touch — and the whole control was gated on the
                customFields ClickApp, which meant switching that off took away
                the ability to hide Due date.
              */
              <details ref={fieldsDetailsRef} className="relative" data-testid="list-columns">
                <summary className="list-none h-8 px-2.5 flex items-center gap-1.5 rounded-full border border-border/80 bg-card text-[12px] cursor-pointer select-none hover:bg-muted/40">
                  <Columns3 className="h-3.5 w-3.5" aria-hidden />
                  {t('list.columns.chip')}
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-border bg-card p-1.5 shadow-lg">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('list.columns.builtIn')}
                  </p>
                  {BUILTIN_COLUMNS.filter((c) => c.views.includes(activeView as 'list' | 'table')).map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        data-testid={`list-column-${c.key.slice(4)}`}
                        checked={!hiddenFields.has(c.key)}
                        onChange={(e) =>
                          setHiddenFields((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.delete(c.key)
                            else next.add(c.key)
                            return next
                          })
                        }
                      />
                      <span className="truncate">{t(c.labelKey)}</span>
                    </label>
                  ))}
                  <p className="px-2 pb-1 text-[11px] text-muted-foreground">{t('list.columns.nameAlways')}</p>
                  {spaceFeatures.customFields && (
                    /* §V2-06 P06 — this SECTION's presence is the read site for
                       the resolved `customFields` feature, so it stays
                       addressable. It is a section of the Columns panel rather
                       than the panel itself, because the built-in columns above
                       it are not custom fields and must not vanish with the
                       ClickApp. */
                    <div data-testid="list-fields-panel" className="border-t border-border/60 pt-1.5">
                      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('list.table.fields', {
                          shown: projectFields.filter((f) => !hiddenFields.has(f.id)).length,
                          total: projectFields.length,
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            )}
            </div>
            {/*
              §V2-07 `[11:32]`/`[11:37]` — the two switches that change which
              rows are on screen, next to the filters rather than buried, which
              is where frame `11:41` puts "Closed" in the toolbar.
            */}
            <ToolbarToggle
              active={!showClosed}
              onClick={() => setShowClosed((v) => !v)}
              testId="list-toggle-closed"
              icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
              label={t(showClosed ? 'list.closedShown' : 'list.closedHidden')}
            />
            <ToolbarToggle
              active={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              testId="list-toggle-archived"
              icon={<Archive className="h-3.5 w-3.5" aria-hidden />}
              label={t(showArchived ? 'list.archivedShown' : 'list.archivedHidden')}
            />
            <CustomizeViewPanel
              listId={listId}
              includeClosed={showClosed}
              includeArchived={showArchived}
              /*
               * §V2-13 `[10:42]` — the download follows the view you are ON.
               * Standing on Board asks for the board shape (and is the paid
               * one); standing anywhere else asks for the list shape, which is
               * free and always has been.
               */
              exportView={activeView === 'board' ? 'board' : 'list'}
              requireBoardExport={() => requireFeature(BOARD_EXPORT_GATE)}
              boardExportLocked={!featureAvailable(BOARD_EXPORT_GATE)}
              boardExportPlan={boardExportPlan}
              view={selectedSavedView}
              onPatch={patchSavedView}
              onAutosave={setViewAutosave}
              onCopyLink={copyViewLink}
              onShare={() => setShareViewOpen(true)}
              /* §V2-S13 `10:35` — the panel's first two rows. */
              cardSize={cardSize}
              onCardSize={setCardSize}
              cardCover={cardCover}
              onCardCover={setCardCover}
              /* §V2-S13 `10:35` — and the three switches under them. */
              isBoard={activeView === 'board'}
              stackFields={stackFields}
              onStackFields={setStackFields}
              showEmptyFields={showEmptyFields}
              onShowEmptyFields={setShowEmptyFields}
              collapseEmptyColumns={collapseEmptyColumns}
              onCollapseEmptyColumns={setCollapseEmptyColumns}
            />

            {spaceFeatures.customFields && (activeView === 'table' || activeView === 'list') && (
              <details ref={fieldsDetailsRef} className="relative">
                <summary className="list-none h-8 px-2.5 flex items-center rounded-md border border-border/80 bg-card text-[12px] cursor-pointer select-none hover:bg-muted/40">
                  {t('list.table.fields', { shown: projectFields.length - hiddenFields.size, total: projectFields.length })}
                </summary>
                <div className="absolute z-20 mt-1 w-56 rounded-md border border-border bg-card p-1.5 shadow-lg">
                  {/* ClickUp's Fields panel leads with a search box — with more
                      than a handful of fields, scanning a raw list is the slow part. */}
                  <input
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder={t('list.table.searchFields')}
                    aria-label={t('list.table.searchFields')}
                    className="mb-1 h-7 w-full rounded border border-border bg-background px-2 text-[12px]"
                  />
                  {projectFields
                    .filter((f) => f.name.toLowerCase().includes(fieldSearch.trim().toLowerCase()))
                    .map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenFields.has(f.id)}
                        onChange={(e) =>
                          setHiddenFields((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.delete(f.id)
                            else next.add(f.id)
                            return next
                          })
                        }
                      />
                      <span className="truncate">{f.name}</span>
                    </label>
                  ))}
                  {projectFields.length === 0 && (
                    <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('list.table.noFieldsYet')}</p>
                  )}
                  <form
                    className="mt-1 space-y-1 border-t border-border/60 pt-1.5"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (newFieldName.trim()) createField.mutate()
                    }}
                  >
                    <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('list.table.createField')}
                    </p>
                    <input
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder={t('list.table.newFieldName')}
                      aria-label={t('list.table.newFieldName')}
                      className="h-7 w-full rounded border border-border bg-background px-2 text-[12px]"
                    />
                    <div className="flex gap-1">
                      <select
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as CustomFieldDef['type'])}
                        aria-label={t('list.table.newFieldType')}
                        className="h-7 flex-1 rounded border border-border bg-background px-1 text-[12px]"
                      >
                        {CUSTOM_FIELD_TYPES.map((ty) => (
                          <option key={ty} value={ty}>{t(CUSTOM_FIELD_TYPE_LABELS[ty])}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={
                          !newFieldName.trim() ||
                          createField.isPending ||
                          (newFieldType === 'dropdown' && !newFieldOptions.trim())
                        }
                        className="h-7 shrink-0 rounded border border-border bg-card px-2 text-[12px] hover:bg-muted/40 disabled:opacity-50"
                      >
                        {t('list.table.addField')}
                      </button>
                    </div>
                    {newFieldType === 'dropdown' && (
                      <input
                        value={newFieldOptions}
                        onChange={(e) => setNewFieldOptions(e.target.value)}
                        placeholder={t('list.table.dropdownOptions')}
                        aria-label={t('list.table.dropdownOptions')}
                        className="h-7 w-full rounded border border-border bg-background px-2 text-[12px]"
                      />
                    )}
                  </form>
                  <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t('list.saveToPersist')}</p>
                </div>
              </details>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setStatusManagerOpen(true)}
              title={t('list.manageStatusesTitle')}
            >
              {t('list.statusesButton')}
            </Button>
            {spaceFeatures.listEmail && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[12px]"
                onClick={() => setEmailAliasOpen(true)}
                title={t('list.emailAliasTitle')}
                data-testid="list-email-button"
              >
                {t('list.emailButton')}
              </Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          // §2.9a — rows, not the words "Loading tasks…" in a box.
          <ListSkeleton rows={8} rowClassName="h-10" />
        ) : emptiedByFilter ? (
          /*
           * §V2-S13 frame `11:30` — the empty state a FILTER produced.
           *
           * Deliberately a different element with different words, not the
           * same box with an extra line: the frame's whole point is that the
           * screen distinguishes "this list has nothing in it" from "what you
           * are looking through matched nothing", and names the second. So it
           * says how many rows are being hidden (a number the person can check
           * against the sidebar), lists the narrowings by name, and carries the
           * undo — "To see all tasks, turn off Me Mode" in the frame, one
           * button here because Rundesk has seven axes rather than one.
           *
           * There is NO "Create task" here on purpose. Creating a task while a
           * search is hiding everything makes a row that immediately vanishes,
           * which is the invitation the old copy was extending.
           */
          <div
            data-testid="list-empty-filtered"
            data-hidden-count={tasks.length}
            data-filters={activeNarrowings.map((n) => n.key).join(',')}
            className="rounded-xl border border-dashed border-amber-400/50 bg-amber-500/5 p-12 text-center"
          >
            <Filter className="mx-auto mb-3 h-6 w-6 text-amber-600/70 dark:text-amber-300/70" aria-hidden />
            <p className="text-[15px] font-medium text-foreground mb-1" data-testid="list-empty-filtered-title">
              {t('list.empty.filteredTitle')}
            </p>
            <p className="text-[13px] text-muted-foreground mb-1" data-testid="list-empty-filtered-count">
              {tCount('list.empty.filteredHidden', tasks.length, { count: tasks.length })}
            </p>
            <p className="text-[13px] text-muted-foreground mb-4" data-testid="list-empty-filtered-names">
              {t('list.empty.filteredBy', { filters: activeNarrowings.map((n) => n.label).join(' · ') })}
            </p>
            <Button
              size="sm"
              variant="outline"
              data-testid="list-empty-clear-filters"
              onClick={clearAllNarrowings}
            >
              {t('list.empty.clearFilters')}
            </Button>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div
            data-testid="list-empty-none"
            className="rounded-xl border border-dashed border-border/80 bg-[#fbfbfc]/60 dark:bg-[#16181d]/40 p-12 text-center"
          >
            <p className="text-[15px] font-medium text-foreground mb-1">{t('list.noTasksYet')}</p>
            <p className="text-[13px] text-muted-foreground mb-4">
              {t('list.empty.addFirstHintBefore')}{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono">C</kbd> {t('list.empty.addFirstHintAfter')}
            </p>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => quickAddRef.current?.focus()}>
              {t('list.createTask')}
            </Button>
          </div>
        ) : activeView === 'list' ? (
          <>
          <ListColumnBar
            sort={sort}
            onSort={handleSort}
            columnFilters={columnFilters}
            onColumnFilters={setColumnFilters}
            workspaceMembers={workspaceMembers}
            groupBy={groupBy}
            showPriority={spaceFeatures.priority}
          />
          <GroupedListView
            tasks={visibleTasks}
            groupBy={groupBy}
            subtaskMode={subtaskMode}
            subtaskStamp={subtaskStamp}
            hiddenCols={hiddenFields}
            selectedTaskIds={selectedTaskIds}
            onPatchTask={async (taskId, patch) => {
              await api(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(patch) })
              await refetch()
            }}
            onToggleSelect={(taskId, additive) => {
              setSelectedTaskIds((prev) => {
                const next = new Set(prev)
                if (additive) {
                  if (next.has(taskId)) next.delete(taskId)
                  else next.add(taskId)
                } else if (next.size === 1 && next.has(taskId)) {
                  next.clear()
                } else {
                  next.clear()
                  next.add(taskId)
                }
                return next
              })
            }}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onToggleDone={async (task) => {
              // Pick the list's first "closed" status when completing,
              // and the first "open" status when re-opening, so the toggle
              // works regardless of how the user has renamed things.
              const isClosed = task.statusCategory === 'closed' || task.status === 'done'
              const target = isClosed
                ? listStatuses.find((s) => s.category === 'open') ?? listStatuses[0]
                : listStatuses.find((s) => s.category === 'closed') ?? listStatuses[listStatuses.length - 1]
              const nextStatus = target?.key ?? (isClosed ? 'todo' : 'done')
              await api(`/tasks/${task.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
              })
              await refetch()
            }}
            onAddTask={async (status, title, opts) => {
              await api('/tasks', {
                method: 'POST',
                body: JSON.stringify(
                  buildCreateTaskBody({
                    listId,
                    title,
                    status,
                    priority: opts?.priority,
                    dueDate: opts?.dueDate,
                    startDate: opts?.startDate,
                    /*
                     * §V2-S13 `10:52` — grouped by assignee, the group IS the
                     * assignee. `assigneeIds` has been understood by
                     * `POST /tasks` the whole time (tasks.controller.ts), so
                     * this is one call rather than a create followed by an
                     * assign that can fail on its own and leave the task in
                     * the wrong group with no sign that anything went wrong.
                     */
                    assigneeIds: opts?.assigneeId ? [opts.assigneeId] : undefined,
                  }),
                ),
              })
              await refetch()
            }}
          />
          </>
        ) : activeView === 'board' ? (
          <DndContext sensors={boardSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {boardStatuses.map((s) => (
                <BoardColumn
                  key={s.key}
                  status={s.key}
                  showWip={spaceFeatures.wipLimits}
                  // §V2-S13 `10:35` — the two Customize rows, reaching the card.
                  cardSize={cardSize}
                  cardCover={cardCover}
                  stackFields={stackFields}
                  showEmptyFields={showEmptyFields}
                  tasks={tasksByStatus[s.key] ?? []}
                  onOpenTask={(taskId) => setSelectedTaskId(taskId)}
                  /*
                   * §V2-S13 `10:35` — "Collapse empty columns", XOR'd with the
                   * chevron rather than OR'd with it.
                   *
                   * `collapsedColumns` is the set of columns somebody pressed,
                   * and with the switch off that is still exactly what it
                   * means (`false !== x` is `x`). With the switch on, an empty
                   * column starts collapsed AND its chevron still opens it —
                   * the press records a difference from the default rather
                   * than an absolute, so it works in both directions. OR'd,
                   * the chevron on an auto-collapsed column would be a control
                   * that visibly moves and changes nothing.
                   */
                  collapsed={
                    collapsedColumns.has(s.key) !==
                    (collapseEmptyColumns && (tasksByStatus[s.key] ?? []).length === 0)
                  }
                  onToggleCollapse={() =>
                    setCollapsedColumns((prev) => {
                      const next = new Set(prev)
                      if (next.has(s.key)) next.delete(s.key)
                      else next.add(s.key)
                      return next
                    })
                  }
                  onRename={listStatuses.length === 0 ? undefined : async (name) => {
                    await api(`/lists/${listId}/statuses/${s.id}`, {
                      method: 'PATCH',
                      body: { name },
                    })
                    await qc.invalidateQueries({ queryKey: ['list-statuses', listId] })
                    await refetch()
                  }}
                  wipLimit={wipLimits[s.key]}
                  onSetWipLimit={(n) =>
                    setWipLimits((prev) => {
                      const next = { ...prev }
                      if (n == null) delete next[s.key]
                      else next[s.key] = n
                      return next
                    })
                  }
                  onAddTask={async (title) => {
                    await api('/tasks', {
                      method: 'POST',
                      body: JSON.stringify({ listId, title, status: s.key, priority: 'normal' }),
                    })
                    await refetch()
                  }}
                />
              ))}
              <AddBoardGroup
                onAdd={async (name) => {
                  await api(`/lists/${listId}/statuses`, {
                    method: 'POST',
                    body: { name, color: '#94a3b8', category: 'open' },
                  })
                  await qc.invalidateQueries({ queryKey: ['list-statuses', listId] })
                  await refetch()
                }}
              />
            </div>
            <DragOverlay>
              {draggingTask ? (
                <div className="w-56 rounded border border-border bg-card p-2 shadow-xl">
                  <div className="font-medium text-sm">{draggingTask.title}</div>
                  <div className="text-xs text-muted-foreground">{t(PRIORITY_LABEL_KEYS[draggingTask.priority])}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : activeView === 'table' ? (
          <TableView
            tasks={visibleTasks}
            workspaceId={workspaceId}
            projectId={projectId}
            projectFields={projectFields.filter((f) => !hiddenFields.has(f.id))}
            /* §M `12:10` — the same Set, read for the `col:*` keys instead. One
               Set means one thing to persist and one thing to fingerprint. */
            hiddenCols={hiddenFields}
            customFieldByTask={customFieldByTask}
            workspaceMembers={workspaceMembers}
            sort={sort}
            onSort={handleSort}
            columnFilters={columnFilters}
            onColumnFilters={setColumnFilters}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onPatchTask={async (id, patch) => {
              await api(`/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(patch),
              })
              await refetch()
            }}
            onAddTask={async (title) => {
              // Omit status so the backend seeds the list's first/default status
              // (resolveStatusForList) — a hardcoded 'todo' would mis-seed lists
              // whose status set doesn't start with (or lack) 'todo'.
              await api('/tasks', {
                method: 'POST',
                body: JSON.stringify({ listId, title, priority: 'normal' }),
              })
              await refetch()
            }}
            onRefresh={refetch}
          />
        ) : activeView === 'gantt' ? (
          <GanttView
            tasks={visibleTasks}
            groupBy={groupBy}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onReschedule={rescheduleTaskSpan}
          />
        ) : activeView === 'team' ? (
          <TeamView
            listId={listId}
            includeArchived={showArchived}
            /*
             * The list's own refresh stamp, in the rollup's cache key. The
             * rollup is computed server-side now, so it no longer re-derives
             * itself when a task changes under it — closing the detail sheet
             * after ticking something off would leave the load counts saying
             * what they said before. Keyed on the stamp, it refetches with
             * everything else the list refetches.
             */
            stamp={dataUpdatedAt}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onUnlock={() => requireFeature(TEAM_VIEW_GATE)}
          />
        ) : (
          <Card className="p-4" data-testid="list-calendar" data-calendar-period={calendarPeriodKey}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {/*
                  §V2-S13 frame `09:35` — the calendar toolbar reads
                  `Today` · `Month ▾` · `‹` `›` · `August 2026`, and Today is
                  the leftmost control on it.

                  Rundesk had prev and next and nothing else, and
                  `calendarMonth` starts at the current month and is only ever
                  MOVED by those two arrows — so once you had paged forward to
                  March there was no control that brought you back. You counted
                  clicks. The button is not decoration on top of the arrows: it
                  is the only way back to now that does not depend on
                  remembering how far you went.

                  Disabled while the viewport already holds today, so it says
                  where you are as well as taking you there — and so a check
                  can tell "pressed and moved" from "pressed and was already
                  home", which a button that is always enabled cannot.
                */}
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="list-calendar-today"
                  disabled={calendarOnToday}
                  aria-label={t('list.calendar.todayAria')}
                  onClick={() => setCalendarMonth(calendarView === 'week' ? new Date() : startOfMonth(new Date()))}
                >
                  {t('list.calendar.today')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="list-calendar-prev"
                  onClick={() =>
                    setCalendarMonth((d) => (calendarView === 'week' ? addDays(d, -7) : addMonths(d, -1)))
                  }
                >
                  {t('list.calendar.prev')}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold" data-testid="list-calendar-period">
                  {calendarView === 'week'
                    ? `${shortDate(startOfWeek(calendarMonth, { weekStartsOn: 1 }), locale)} – ${endOfWeek(calendarMonth, { weekStartsOn: 1 }).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
                  {(['month', 'week'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setCalendarView(v)}
                      className={cn(
                        'px-2 py-0.5 rounded capitalize',
                        calendarView === v ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {v === 'month' ? t('list.calendar.month') : t('list.calendar.week')}
                    </button>
                  ))}
                </div>
                <WorkFilterSelect
                  value={calendarAssignee}
                  onChange={(v) => setCalendarAssignee(v)}
                  className="max-w-[11rem]"
                >
                  <option value="all">{t('list.calendar.allAssignees')}</option>
                  {workspaceMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || m.email}
                    </option>
                  ))}
                </WorkFilterSelect>
              </div>
              <Button
                size="sm"
                variant="outline"
                data-testid="list-calendar-next"
                onClick={() =>
                  setCalendarMonth((d) => (calendarView === 'week' ? addDays(d, 7) : addMonths(d, 1)))
                }
              >
                {t('list.calendar.next')}
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground mb-2">
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i)
                return (
                  <div key={i} className="px-1">
                    {day.toLocaleDateString(locale, { weekday: 'short' })}
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate.find(([k]) => k === key)?.[1] ?? []
                const isDragTarget = calendarDragTaskId != null
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      if (calendarDragTaskId) e.preventDefault()
                    }}
                    onDrop={() => {
                      if (calendarDragTaskId) {
                        void rescheduleTask(calendarDragTaskId, day)
                        setCalendarDragTaskId(null)
                      }
                    }}
                    className={cn(
                      calendarView === 'week' ? 'min-h-64' : 'min-h-28',
                      'group/day rounded border border-border p-2 transition-colors',
                      isToday(day) && 'ring-1 ring-ring',
                      isSameMonth(day, calendarMonth) ? 'bg-card' : 'bg-muted/30 text-muted-foreground',
                      isDragTarget && 'hover:ring-2 hover:ring-brand-500 hover:bg-accent/10',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs">{format(day, 'd')}</span>
                      <button
                        type="button"
                        aria-label={t('list.calendar.addTaskAria')}
                        onClick={() => {
                          setCalendarQuickAddDay(key)
                          setCalendarQuickAddTitle('')
                        }}
                        className="opacity-0 group-hover/day:opacity-100 text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, calendarView === 'week' ? 12 : 3).map((task) => (
                        <button
                          key={task.id}
                          draggable
                          onDragStart={() => setCalendarDragTaskId(task.id)}
                          onDragEnd={() => setCalendarDragTaskId(null)}
                          className="block w-full text-left rounded bg-muted px-1 py-0.5 text-[11px] hover:bg-secondary cursor-grab active:cursor-grabbing"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayTasks.length > (calendarView === 'week' ? 12 : 3) ? (
                        <div className="text-[11px] text-muted-foreground">
                          {t('list.calendar.more', { count: dayTasks.length - (calendarView === 'week' ? 12 : 3) })}
                        </div>
                      ) : null}
                      {calendarQuickAddDay === key && (
                        <input
                          autoFocus
                          value={calendarQuickAddTitle}
                          onChange={(e) => setCalendarQuickAddTitle(e.target.value)}
                          onBlur={() => setCalendarQuickAddDay(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && calendarQuickAddTitle.trim()) {
                              void createTaskOnDay(day, calendarQuickAddTitle.trim())
                              setCalendarQuickAddDay(null)
                              setCalendarQuickAddTitle('')
                            }
                            if (e.key === 'Escape') setCalendarQuickAddDay(null)
                          }}
                          placeholder={t('list.taskTitle')}
                          className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
      <BulkActionBar
        selectedIds={selectedTaskIds}
        onClear={() => setSelectedTaskIds(new Set())}
        workspaceMembers={workspaceMembers}
        moveLists={projectLists.filter((l) => l.id !== listId)}
        onApplied={async () => {
          setSelectedTaskIds(new Set())
          await refetch()
        }}
      />
      <TaskDetailSheet
        taskId={selectedTaskId}
        open={Boolean(selectedTaskId)}
        onOpenChange={(next) => !next && setSelectedTaskId(null)}
        workspaceId={workspaceId}
        focusCommentId={commentParam ?? null}
      />
      <ListStatusesManager listId={listId} open={statusManagerOpen} onOpenChange={setStatusManagerOpen} />
      <ListEmailAliasPanel listId={listId} open={emailAliasOpen} onOpenChange={setEmailAliasOpen} />
      <SharePanel
        open={sharePanelOpen}
        onOpenChange={setSharePanelOpen}
        objectType="list"
        objectId={listId}
        objectName={listMeta?.name}
      />
      {selectedSavedView && (
        <SharePanel
          open={shareViewOpen}
          onOpenChange={setShareViewOpen}
          objectType="view"
          objectId={selectedSavedView.id}
          objectName={selectedSavedView.name}
        />
      )}
      {/* §V2-13 frames `09:26` / `10:42` — one dialog, both gates. */}
      {gateDialog}
    </div>
    </SpaceFeaturesContext.Provider>
    </ListStatusesContext.Provider>
  )
}

function GroupedListView({
  tasks,
  groupBy,
  selectedTaskIds,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
  subtaskMode,
  subtaskStamp,
  hiddenCols,
  onAddTask,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority' | 'assignee'
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
  /** §M `12:10` — passed to every row; see TaskRow for what each value means. */
  subtaskMode: SubtaskMode
  subtaskStamp: number
  hiddenCols: Set<string>
  /**
   * §V2-S13 frame `10:52` — creating INTO a group.
   *
   * `assigneeId` is here because grouping by assignee is the third axis this
   * view offers and an add control that could not set it would put every new
   * task into the Unassigned group no matter which one you pressed — a control
   * that looks right and lands somewhere else.
   */
  onAddTask: (
    status: TaskStatus,
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string; assigneeId?: string },
  ) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
  /*
   * §V2-S13 `10:52` — the status a task created from a non-status group lands
   * in. Priority and assignee groups say nothing about status, so the list's
   * FIRST open status is used rather than a hardcoded 'todo' that a list which
   * renamed its statuses does not have.
   */
  const defaultStatus = (ordered.find((s) => s.category === 'open') ?? ordered[0])?.key as TaskStatus | undefined
  const grouped = useMemo(() => {
    const map: Record<string, TaskItem[]> = {}
    for (const s of ordered) map[s.key] = []
    for (const task of tasks) {
      if (!map[task.status]) map[task.status] = []
      map[task.status].push(task)
    }
    return map
  }, [tasks, ordered])

  // Collapse by default: closed-category statuses start collapsed so the
  // active work is visible first.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const s of ordered) initial[s.key] = s.category === 'closed'
    return initial
  })

  if (groupBy === 'assignee') {
    // Group by each task's first assignee; a task with no assignee lands in
    // "Unassigned". Names come from the task's own assignee payload.
    const groups = new Map<string, { name: string; tasks: TaskItem[] }>()
    for (const task of tasks) {
      const first = task.assignees?.[0]
      const gid = first?.userId ?? '__unassigned__'
      const name = first?.user?.displayName ?? t('list.group.unassigned')
      if (!groups.has(gid)) groups.set(gid, { name, tasks: [] })
      groups.get(gid)!.tasks.push(task)
    }
    const ordered = [...groups.entries()].sort((a, b) => {
      if (a[0] === '__unassigned__') return 1
      if (b[0] === '__unassigned__') return -1
      return a[1].name.localeCompare(b[1].name)
    })
    return (
      <div className="space-y-4">
        {ordered.map(([gid, group]) => (
          <Card key={gid} className="p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              {gid === '__unassigned__' ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">?</span>
              ) : (
                <PersonAvatar name={group.name} size="xs" />
              )}
              {group.name} ({group.tasks.length})
            </div>
            <div className="space-y-2">
              {group.tasks.length >= VIRTUALIZE_THRESHOLD ? (
                <VirtualizedTaskRows
                  virtualKey={`assignee:${gid}`}
                  tasks={group.tasks}
                  selectedTaskIds={selectedTaskIds}
                  onToggleSelect={onToggleSelect}
                  onOpenTask={onOpenTask}
                  onToggleDone={onToggleDone}
                  subtaskMode={subtaskMode}
                  subtaskStamp={subtaskStamp}
                  hiddenCols={hiddenCols}
                />
              ) : (
                group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={selectedTaskIds.has(task.id)}
                    onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                    subtaskMode={subtaskMode}
                    subtaskStamp={subtaskStamp}
                    hiddenCols={hiddenCols}
                  />
                ))
              )}
            </div>
            {/*
              §V2-S13 `10:52` — the same `+ Add Task` the status groups get.
              The new task is ASSIGNED to the group it was created in (or left
              unassigned in the Unassigned group), which is the only thing that
              makes the control mean what its position says it means.
            */}
            {defaultStatus && (
              <InlineAddTask
                status={defaultStatus}
                groupKey={gid}
                groupLabel={group.name}
                onAdd={(title, opts) =>
                  onAddTask(defaultStatus, title, {
                    ...opts,
                    assigneeId: gid === '__unassigned__' ? undefined : gid,
                  })
                }
              />
            )}
          </Card>
        ))}
      </div>
    )
  }

  if (groupBy === 'priority') {
    const priorityGroups: TaskPriority[] = ['urgent', 'high', 'normal', 'low']
    return (
      <div className="space-y-4">
        {priorityGroups.map((priority) => {
          const groupTasks = tasks.filter((task) => task.priority === priority)
          return (
            <Card key={priority} className="p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium capitalize">
                <Flag className={cn('h-4 w-4', PRIORITY_COLORS[priority])} />
                {t(PRIORITY_LABEL_KEYS[priority])} ({groupTasks.length})
              </div>
              <div className="space-y-2">
                {groupTasks.length >= VIRTUALIZE_THRESHOLD ? (
                  <VirtualizedTaskRows
                    virtualKey={`priority:${priority}`}
                    tasks={groupTasks}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelect={onToggleSelect}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                    onPatchTask={onPatchTask}
                    subtaskMode={subtaskMode}
                    subtaskStamp={subtaskStamp}
                    hiddenCols={hiddenCols}
                  />
                ) : (
                  groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                      onOpenTask={onOpenTask}
                      onToggleDone={onToggleDone}
                      onPatchTask={onPatchTask}
                      subtaskMode={subtaskMode}
                      subtaskStamp={subtaskStamp}
                      hiddenCols={hiddenCols}
                    />
                  ))
                )}
                {groupTasks.length === 0 && <div className="text-xs text-muted-foreground">{t('list.noTasks')}</div>}
              </div>
              {/*
                §V2-S13 `10:52` — an EMPTY group offers it too. The frame's
                `TO DO 0` carries `+ Add Task`, and a group you can only add to
                once it already has something in it is the one case where you
                most want it.
              */}
              {defaultStatus && (
                <InlineAddTask
                  status={defaultStatus}
                  groupKey={priority}
                  groupLabel={t(PRIORITY_LABEL_KEYS[priority])}
                  fixedPriority={priority}
                  onAdd={(title, opts) => onAddTask(defaultStatus, title, { ...opts, priority })}
                />
              )}
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {ordered
        .filter((s) => (grouped[s.key]?.length ?? 0) > 0 || s.category === 'open' || s.category === 'in_progress')
        .map((statusDef) => {
          const status = statusDef.key
          const groupTasks = grouped[status] ?? []
          const isCollapsed = collapsed[status]
          return (
          <section
            key={status}
            /*
             * §V2-S13 `10:52` — addressable as a GROUP, with its own count, so
             * "the empty `TO DO 0` group offers + Add Task too" is a claim
             * about one identified group rather than about whichever section
             * happened to be first on screen.
             */
            data-testid="list-group"
            data-group={status}
            data-count={groupTasks.length}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <header
              className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 cursor-pointer select-none"
              onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: statusDef.color }}
              />
              <h3 className="font-semibold text-sm text-foreground">{resolveStatusLabel(statusDef.key, statusDef.name, t)}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{groupTasks.length}</span>
            </header>
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {groupTasks.length >= VIRTUALIZE_THRESHOLD ? (
                  <VirtualizedTaskRows
                    virtualKey={`status:${status}`}
                    tasks={groupTasks}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelect={onToggleSelect}
                    onOpenTask={onOpenTask}
                    onToggleDone={onToggleDone}
                    onPatchTask={onPatchTask}
                    subtaskMode={subtaskMode}
                    subtaskStamp={subtaskStamp}
                    hiddenCols={hiddenCols}
                  />
                ) : (
                  groupTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedTaskIds.has(task.id)}
                      onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                      onOpenTask={onOpenTask}
                      onToggleDone={onToggleDone}
                      onPatchTask={onPatchTask}
                      subtaskMode={subtaskMode}
                      subtaskStamp={subtaskStamp}
                      hiddenCols={hiddenCols}
                    />
                  ))
                )}
                {/* §V2-S13 `10:52` — the frame's `+ Add Task`, inside the group. */}
                <InlineAddTask
                  status={status}
                  groupKey={status}
                  groupLabel={resolveStatusLabel(statusDef.key, statusDef.name, t)}
                  onAdd={(title, opts) => onAddTask(status, title, opts)}
                />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function VirtualizedTaskRows({
  virtualKey,
  tasks,
  selectedTaskIds,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
  subtaskMode,
  subtaskStamp,
  hiddenCols,
}: {
  virtualKey: string
  tasks: TaskItem[]
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
  /** §M `12:10` — passed to every row; see TaskRow for what each value means. */
  subtaskMode: SubtaskMode
  subtaskStamp: number
  hiddenCols: Set<string>
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TASK_ROW_ESTIMATE_PX,
    overscan: 8,
  })

  return (
    <div key={virtualKey} ref={parentRef} className="max-h-[60vh] overflow-auto">
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((row) => {
          const task = tasks[row.index]
          return (
            <div
              key={task.id}
              ref={rowVirtualizer.measureElement}
              data-index={row.index}
              className={cn(
                'absolute left-0 top-0 w-full border-b border-border',
                row.index === tasks.length - 1 && 'border-b-0',
              )}
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <TaskRow
                task={task}
                selected={selectedTaskIds.has(task.id)}
                onToggleSelect={(additive) => onToggleSelect(task.id, additive)}
                onOpenTask={onOpenTask}
                onToggleDone={onToggleDone}
                onPatchTask={onPatchTask}
                subtaskMode={subtaskMode}
                subtaskStamp={subtaskStamp}
                hiddenCols={hiddenCols}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  selected,
  onToggleSelect,
  onOpenTask,
  onToggleDone,
  onPatchTask,
  subtaskMode = 'collapsed',
  subtaskStamp = 0,
  hiddenCols,
}: {
  task: TaskItem
  selected: boolean
  onToggleSelect: (additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
  /**
   * §M frame `12:10` — what the Subtasks chip is set to. `separate` means the
   * children are already in `tasks` as rows of their own, so the tree here has
   * to go: with both, every subtask would be drawn twice and the count at the
   * top of the list would disagree with the rows under it.
   */
  subtaskMode?: SubtaskMode
  /** Bumped on every choice, so choosing "Expand all" twice expands twice. */
  subtaskStamp?: number
  /** Built-in columns the Columns panel has switched off, keyed `col:*`. */
  hiddenCols?: Set<string>
}) {
  const { t, locale } = useTranslation()
  // statusCategory ('closed') is the post-custom-statuses signal; falling
  // back to the literal 'done' key keeps existing tasks rendering correctly
  // while the API/list-statuses caches warm up.
  const isDone = task.statusCategory === 'closed' || task.status === 'done'
  const assignees = task.assignees ?? []
  // Subtasks tree (Plan §4.3): nest children under an expander, with the
  // parent showing rolled-up progress.
  const subtasks = task.subtasks ?? []
  const nestSubtasks = subtaskMode !== 'separate'
  const hasSubtasks = nestSubtasks && subtasks.length > 0
  const subtasksDone = subtasks.filter((s) => s.statusCategory === 'closed' || s.status === 'done').length
  const [expanded, setExpanded] = useState(subtaskMode === 'expanded')
  /*
   * Keyed on the STAMP, not on the mode. Keyed on the mode, a row collapsed by
   * hand would ignore a second "Expand all" — the mode has not changed, so
   * nothing re-runs, and the menu item looks broken on exactly the press that
   * matters. The per-row toggle still wins until the next choice.
   */
  useEffect(() => {
    if (subtaskMode !== 'separate') setExpanded(subtaskMode === 'expanded')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtaskStamp])
  const showCol = (key: string) => !hiddenCols?.has(key)
  // Inline edits (Plan §5): cycle priority on click; edit due date in place.
  const cyclePriority = () => {
    const order: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
    const next = order[(order.indexOf(task.priority) + 1) % order.length]
    void onPatchTask?.(task.id, { priority: next })
  }

  return (
    <div>
    <div
      /*
       * ADDRESSABLE, AND BY ID. A check that wants to say something about ONE
       * row cannot do it by text: the "Task created" toast names the task too,
       * so `getByText(title)` is true whether or not the list refreshed. The
       * id is here for the same reason the toast carries one — a check should
       * be able to say which row it found.
       */
      data-testid="list-task-row"
      data-task-id={task.id}
      className={cn(
        'group flex items-center gap-3 px-3 py-2 hover:bg-muted/60 cursor-pointer transition-colors',
        selected && 'bg-accent/10 hover:bg-accent/15',
      )}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault()
          onToggleSelect(true)
          return
        }
        onOpenTask(task.id)
      }}
    >
      {hasSubtasks ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((x) => !x)
          }}
          className="-ml-1 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={expanded ? t('list.subtasks.collapseAria') : t('list.subtasks.expandAria')}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span className="w-2.5 shrink-0" aria-hidden />
      )}
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggleSelect(e.target.checked ? true : false)}
        className={cn(
          'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border accent-accent',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          selected && 'opacity-100',
        )}
        aria-label={selected ? t('list.deselectTaskAria') : t('list.selectTaskAria')}
      />
      <button
        className="shrink-0 text-muted-foreground hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          void onToggleDone(task)
        }}
        aria-label={isDone ? t('list.markIncompleteAria') : t('list.markDoneAria')}
      >
        {isDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'truncate text-sm font-medium',
              isDone && 'line-through text-muted-foreground',
            )}
          >
            {task.title}
          </span>
          {hasSubtasks && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((x) => !x)
              }}
              title={t('list.subtasks.progressTitle', { done: subtasksDone, total: subtasks.length })}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground hover:text-foreground"
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              {subtasksDone}/{subtasks.length}
            </button>
          )}
        </div>
        {(task.openBlockerCount ?? 0) > 0 || (task.blocksOpenCount ?? 0) > 0 ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {(task.openBlockerCount ?? 0) > 0 ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                {t('list.blockedBy', { count: task.openBlockerCount ?? 0 })}
              </span>
            ) : null}
            {(task.blocksOpenCount ?? 0) > 0 ? (
              <span className="rounded-full border border-blue-400/40 bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
                {t('list.blocks', { count: task.blocksOpenCount ?? 0 })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* §M `12:10` — the Columns panel decides whether these three are drawn.
          Each is gated where it is RENDERED rather than by a wrapper, so the
          row's flex spacing closes up instead of leaving a hole. */}
      {showCol('col:priority') && (onPatchTask ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            cyclePriority()
          }}
          className="shrink-0 rounded p-0.5 hover:bg-muted"
          title={t('list.priorityTitle', { priority: t(PRIORITY_LABEL_KEYS[task.priority]) })}
          aria-label={t('list.changePriorityAria')}
        >
          <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[task.priority])} />
        </button>
      ) : (
        <Flag className={cn('h-3.5 w-3.5 shrink-0', PRIORITY_COLORS[task.priority])} />
      ))}

      {/* Coarse on purpose — this is a nudge from a row, not the place you set
          a deadline. It may change the day; it may not quietly drop a time the
          row is carrying, which sending a bare YYYY-MM-DD did. */}
      {showCol('col:due') && (onPatchTask ? (
        <input
          type="date"
          value={toDateInput(task.dueDate)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void onPatchTask(task.id, { dueDate: withDatePart(task.dueDate, e.target.value) })}
          title={t('list.setDueDateTitle')}
          className="h-6 w-[7.5rem] shrink-0 rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-border focus:border-border focus:bg-card focus:outline-none"
        />
      ) : (
        task.dueDate && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <CalendarIcon className="h-3 w-3" />
            {shortDate(new Date(task.dueDate), locale)}
          </div>
        )
      ))}

      {showCol('col:assignees') && (
      <div className="flex -space-x-1 shrink-0 min-w-[40px] justify-end">
        {assignees.slice(0, 3).map((a) => {
          const label = a.user?.displayName?.[0]?.toUpperCase() ?? '?'
          return (
            <div
              key={a.userId}
              className="h-6 w-6 rounded-full bg-brand-300 text-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card"
              title={a.user?.displayName ?? ''}
            >
              {label}
            </div>
          )
        })}
        {assignees.length > 3 && (
          <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
            +{assignees.length - 3}
          </div>
        )}
      </div>
      )}
    </div>
    {hasSubtasks && expanded && (
      <div className="divide-y divide-border/50 border-t border-border/50 bg-muted/20">
        {subtasks.map((st) => (
          <SubtaskRow key={st.id} subtask={st} onOpenTask={onOpenTask} onToggleDone={onToggleDone} />
        ))}
      </div>
    )}
    </div>
  )
}

// A nested child row under an expanded parent (Plan §4.3). Kept lightweight —
// open the task or toggle done; deeper edits happen in the detail sheet.
function SubtaskRow({
  subtask,
  onOpenTask,
  onToggleDone,
}: {
  subtask: Subtask
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
}) {
  const { t, locale } = useTranslation()
  const done = subtask.statusCategory === 'closed' || subtask.status === 'done'
  return (
    <div
      className="group/st flex cursor-pointer items-center gap-3 py-1.5 pl-10 pr-3 transition-colors hover:bg-muted/50"
      onClick={() => onOpenTask(subtask.id)}
    >
      <button
        type="button"
        className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
        onClick={(e) => {
          e.stopPropagation()
          // onToggleDone only reads id/status/statusCategory, all present here.
          void onToggleDone(subtask as unknown as TaskItem)
        }}
        aria-label={done ? t('list.markIncompleteAria') : t('list.markDoneAria')}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5" />}
      </button>
      <span className={cn('min-w-0 flex-1 truncate text-[13px]', done && 'line-through text-muted-foreground')}>
        {subtask.isMilestone && <Diamond className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-500 align-[-1px]" />}
        {subtask.title ?? ''}
      </span>
      <Flag className={cn('h-3 w-3 shrink-0', PRIORITY_COLORS[subtask.priority ?? 'normal'])} />
      {subtask.dueDate && (
        <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {shortDate(new Date(subtask.dueDate), locale)}
        </div>
      )}
    </div>
  )
}

/**
 * §V2-S13 frame `10:52` — `+ Add Task` INSIDE a group.
 *
 * The frame's List tab is grouped by status: each group is a collapsible
 * header, then its rows, then its own `+ Add Task` — and the empty `TO DO 0`
 * group still offers it, which is the whole point. Creating into a named group
 * without leaving the list is the behaviour; landing in the list's default
 * status and having to fix it afterwards is not.
 *
 * `groupKey` is the axis VALUE this composer creates into — a status key, a
 * priority, or a user id — and `fixedPriority` is set when the axis IS
 * priority, because a priority select inside the "Urgent" group is a control
 * that can contradict the group it sits in.
 */
function InlineAddTask({
  status,
  onAdd,
  groupKey,
  groupLabel,
  fixedPriority,
}: {
  status: TaskStatus
  onAdd: (
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
  /** Which group this composer belongs to; defaults to the status it creates. */
  groupKey?: string
  /** What the group is called, for the placeholder. Defaults to the status. */
  groupLabel?: string
  /** Pins the priority when the grouping axis is priority. */
  fixedPriority?: TaskPriority
}) {
  const { t } = useTranslation()
  const meta = useStatusMeta(status)
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState<TaskPriority>(fixedPriority ?? 'normal')
  const [dueDate, setDueDate] = useState('')
  const [active, setActive] = useState(false)
  const key = groupKey ?? status
  const label = groupLabel ?? meta.label
  // Guards the field-level onBlur from collapsing the composer while focus is
  // simply moving between the title/priority/date controls in the same row.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setValue('')
    setPriority(fixedPriority ?? 'normal')
    setDueDate('')
  }

  const submit = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setActive(false)
      reset()
      return
    }
    await onAdd(trimmed, { priority, dueDate })
    reset()
  }

  const onFieldBlur = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      void submit()
    }, 120)
  }
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  if (!active) {
    return (
      <button
        type="button"
        data-testid="list-group-add-task"
        data-group={key}
        aria-label={t('list.group.addTaskAria', { group: label })}
        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        onClick={() => setActive(true)}
      >
        <Plus className="h-4 w-4" />
        {t('list.addTask')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5" data-testid="list-group-add-composer" data-group={key}>
      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={cancelClose}
        onBlur={onFieldBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            cancelClose()
            void submit()
          } else if (e.key === 'Escape') {
            cancelClose()
            reset()
            setActive(false)
          }
        }}
        placeholder={t('list.newStatusTaskPlaceholder', { status: label.toLowerCase() })}
        data-testid="list-group-add-title"
        className="h-7 flex-1 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
      />
      {fixedPriority ? (
        /* The group IS the priority, so it is shown rather than offered — a
           select here could set a value that contradicts the group the new
           task would then not appear in. */
        <span
          className="flex h-7 shrink-0 items-center gap-1 rounded border border-border/70 px-2 text-[12px] capitalize text-muted-foreground"
          data-testid="list-group-add-fixed-priority"
        >
          <Flag className={cn('h-3 w-3', PRIORITY_COLORS[fixedPriority])} aria-hidden />
          {t(PRIORITY_LABEL_KEYS[fixedPriority])}
        </span>
      ) : (
        <WorkFilterSelect
          value={priority}
          onChange={(v) => setPriority(v as TaskPriority)}
          className="h-7 capitalize shrink-0"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p} className="capitalize">
              {t(PRIORITY_LABEL_KEYS[p])}
            </option>
          ))}
        </WorkFilterSelect>
      )}
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onFocus={cancelClose}
        onBlur={onFieldBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            cancelClose()
            void submit()
          } else if (e.key === 'Escape') {
            cancelClose()
            reset()
            setActive(false)
          }
        }}
        title={t('list.sortDueDate')}
        className="h-7 w-[9rem] shrink-0 text-xs border-border/80 focus-visible:ring-0"
      />
    </div>
  )
}

type TaskPatch = Partial<Pick<TaskItem, 'title' | 'status' | 'priority' | 'dueDate'>> & {
  dueDate?: string | null
}

const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

function TableView({
  tasks,
  workspaceId,
  projectId,
  projectFields,
  hiddenCols,
  customFieldByTask,
  workspaceMembers,
  sort,
  onSort,
  columnFilters,
  onColumnFilters,
  onOpenTask,
  onPatchTask,
  onAddTask,
  onRefresh,
}: {
  tasks: TaskItem[]
  workspaceId: string
  projectId: string
  projectFields: CustomFieldDef[]
  /**
   * §M `12:10` — the built-in columns the Columns panel has switched off,
   * keyed `col:*`. The custom fields are already filtered out of
   * `projectFields` by the parent; the same Set carries both because it is one
   * per-view setting, not two.
   */
  hiddenCols: Set<string>
  /** Fetched by the parent, which also needs them for custom-field filters. */
  customFieldByTask: Record<string, Record<string, unknown>>
  workspaceMembers: WorkspaceMember[]
  sort: SortState
  onSort: (field: SortField) => void
  columnFilters: ColumnFilters
  onColumnFilters: (updater: (prev: ColumnFilters) => ColumnFilters) => void
  onOpenTask: (taskId: string) => void
  onPatchTask: (taskId: string, patch: TaskPatch) => Promise<void> | void
  onAddTask: (title: string) => Promise<void> | void
  onRefresh: () => Promise<unknown>
}) {
  const { t, tCount, locale } = useTranslation()
  /** §V2-06 — the space's ClickApps, for the markers this table draws. */
  const rowFeatures = useSpaceFeatureFlags()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  // Disambiguate single-click (open task) from double-click (inline rename): a
  // bare onClick fired on the first click of a dbl-click and opened the sheet
  // before onDoubleClick could run, so rename was unreachable. Hold the open
  // briefly; a second click cancels it and enters edit mode instead.
  const openClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [statusOpenFor, setStatusOpenFor] = useState<string | null>(null)
  const [priorityOpenFor, setPriorityOpenFor] = useState<string | null>(null)
  const [dateOpenFor, setDateOpenFor] = useState<string | null>(null)
  const [assigneeOpenFor, setAssigneeOpenFor] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState<{ taskId: string; fieldId: string } | null>(null)
  const [addActive, setAddActive] = useState(false)
  const [addDraft, setAddDraft] = useState('')
  const tableParentRef = useRef<HTMLDivElement | null>(null)
  const qc = useQueryClient()

  const listStatusList = useListStatuses()
  const listStatusByKey = useMemo(
    () => Object.fromEntries(listStatusList.map((s) => [s.key, s])),
    [listStatusList],
  )

  // Incoming `tasks` are already filtered + sorted by the shared model for
  // standard fields. We re-sort locally so custom-field columns (whose values
  // only exist here) also sort; for standard fields this is idempotent.
  const statusOrder = useMemo(
    () => new Map(listStatusList.map((s) => [s.key, s.position] as const)),
    [listStatusList],
  )
  const sortedTasks = useMemo(
    () => sortTasks(tasks, sort, statusOrder, customFieldByTask),
    [tasks, sort, statusOrder, customFieldByTask],
  )

  // Options for the header filter menus.
  const statusFilterOptions: FilterOption[] = (
    listStatusList.length > 0
      ? listStatusList.map((s) => ({ key: s.key, name: s.name, color: s.color }))
      : Object.entries(DEFAULT_STATUS_META).map(([k, m]) => ({ key: k, name: m.label, color: m.color }))
  ).map((s) => ({ value: s.key, label: resolveStatusLabel(s.key, s.name, t), color: s.color }))
  const priorityFilterOptions: FilterOption[] = PRIORITY_ORDER.map((p) => ({ value: p, label: t(PRIORITY_LABEL_KEYS[p]) }))
  const assigneeFilterOptions: FilterOption[] = [
    { value: UNASSIGNED_FILTER, label: t('list.group.unassigned') },
    ...workspaceMembers.map((m) => ({ value: m.userId, label: m.displayName || m.email })),
  ]

  const allSelected = tasks.length > 0 && tasks.every((task) => selected.has(task.id))
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) return new Set()
      return new Set(tasks.map((task) => task.id))
    })
  }
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const commitTitle = async (task: TaskItem) => {
    const trimmed = titleDraft.trim()
    setEditingTitleId(null)
    if (!trimmed || trimmed === task.title) return
    await onPatchTask(task.id, { title: trimmed })
  }

  const submitAdd = async () => {
    const trimmed = addDraft.trim()
    if (!trimmed) {
      setAddActive(false)
      return
    }
    await onAddTask(trimmed)
    setAddDraft('')
  }

  type TableCol = {
    key: string
    label: string
    width: string
    sortField?: SortField
    filterKind?: 'status' | 'priority' | 'assignee'
  }
  /*
   * §M `12:10` — HIDING A COLUMN TAKES TWO EDITS IN THIS TABLE, not one.
   *
   * The header row maps over this array; the body does NOT — each cell is
   * written out by hand below, in the same order, with a `{/* Status *\/}`
   * comment over it. So filtering here alone removes a heading and leaves its
   * cells, putting every row one column out of step with the row above it —
   * and the result still looks like a table, which is the worst kind of wrong.
   * `showCol` is therefore applied at each cell as well; the two must name the
   * same key.
   *
   * Checkbox and title are not offered: `BUILTIN_COLUMNS` does not list them,
   * and a row with no name is not a row.
   */
  const showCol = (key: string) => !hiddenCols.has(key)
  const allColumns: TableCol[] = [
    { key: 'checkbox', label: '', width: 'w-9' },
    { key: 'title', label: t('list.table.colTitle'), width: 'flex-1 min-w-[240px]', sortField: 'title' },
    { key: 'status', label: t('taskDetail.fieldStatus'), width: 'w-36', sortField: 'status', filterKind: 'status' },
    { key: 'priority', label: t('taskDetail.fieldPriority'), width: 'w-28', sortField: 'priority', filterKind: 'priority' },
    { key: 'assignees', label: t('taskDetail.fieldAssignees'), width: 'w-28', sortField: 'assignee', filterKind: 'assignee' },
    { key: 'due', label: t('taskDetail.fieldDueDate'), width: 'w-28', sortField: 'due' },
    { key: 'created', label: t('list.table.colCreated'), width: 'w-24', sortField: 'created' },
  ]
  const columns = allColumns.filter((c) => showCol(`col:${c.key}`))
  // Visibility is controlled upstream by the view's Fields picker; render all
  // that were passed in (Plan §4/§5 per-view custom-field visibility).
  const customColumns = projectFields
  const selectedIds = Array.from(selected)
  const useTableVirtualization = sortedTasks.length >= TABLE_VIRTUALIZE_THRESHOLD
  const tableRowVirtualizer = useVirtualizer({
    count: useTableVirtualization ? sortedTasks.length : 0,
    getScrollElement: () => tableParentRef.current,
    estimateSize: () => TABLE_ROW_ESTIMATE_PX,
    overscan: 14,
  })
  const tableVirtualItems = useTableVirtualization ? tableRowVirtualizer.getVirtualItems() : []
  const tableTopPadding = useTableVirtualization && tableVirtualItems.length > 0 ? tableVirtualItems[0]!.start : 0
  const tableBottomPadding =
    useTableVirtualization && tableVirtualItems.length > 0
      ? tableRowVirtualizer.getTotalSize() - tableVirtualItems[tableVirtualItems.length - 1]!.end
      : 0
  const applyBulkPatch = async (patch: TaskPatch) => {
    await Promise.all(selectedIds.map((id) => onPatchTask(id, patch)))
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <TableStatusLegend />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-accent/10 text-xs">
          <span className="font-medium text-foreground">{tCount('list.bulk.selected', selectedIds.length)}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ status: 'done' })}>
            {t('list.table.markDone')}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void applyBulkPatch({ priority: 'high' })}>
            {t('list.table.highPriority')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void applyBulkPatch({ dueDate: new Date().toISOString() })}
          >
            {t('list.table.dueToday')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelected(new Set())}>
            {t('list.clear')}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          {/* Header — click a label to sort, funnel to filter (Plan §5.1/§5.5) */}
          <div
            data-testid="list-table-head"
            className="sticky top-0 z-10 flex items-center bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            {columns.map((col) => (
              <div
                key={col.key}
                /*
                 * §M `12:10` — named PER COLUMN so a check can say WHICH
                 * heading went. Counting the children would also count the
                 * custom-field headings, so a suite that hid Status and gained
                 * a field would read as passing.
                 */
                data-testid={`list-table-head-${col.key}`}
                className={cn('group px-3 py-2 flex items-center gap-1', col.width)}
              >
                {col.key === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-border accent-brand-700 cursor-pointer"
                    aria-label={t('list.table.selectAllAria')}
                  />
                ) : col.sortField ? (
                  <>
                    <SortHeaderButton label={col.label} field={col.sortField} sort={sort} onSort={onSort} />
                    {col.filterKind === 'status' && (
                      <ColumnFilterMenu
                        ariaLabel={t('list.filter.ariaStatus')}
                        options={statusFilterOptions}
                        selected={columnFilters.statuses}
                        onChange={(next) => onColumnFilters((f) => ({ ...f, statuses: next }))}
                      />
                    )}
                    {col.filterKind === 'priority' && (
                      <ColumnFilterMenu
                        ariaLabel={t('list.filter.ariaPriority')}
                        options={priorityFilterOptions}
                        selected={columnFilters.priorities}
                        onChange={(next) => onColumnFilters((f) => ({ ...f, priorities: next as TaskPriority[] }))}
                      />
                    )}
                    {col.filterKind === 'assignee' && (
                      <ColumnFilterMenu
                        ariaLabel={t('list.filter.ariaAssignee')}
                        options={assigneeFilterOptions}
                        selected={columnFilters.assignees}
                        onChange={(next) => onColumnFilters((f) => ({ ...f, assignees: next }))}
                      />
                    )}
                  </>
                ) : (
                  col.label
                )}
              </div>
            ))}
            {customColumns.map((field) => (
              <div key={field.id} className="group px-3 py-2 w-36 flex items-center gap-1">
                <SortHeaderButton label={field.name} field={`custom:${field.id}` as SortField} sort={sort} onSort={onSort} />
              </div>
            ))}
          </div>

          {/* Rows */}
          <div
            ref={useTableVirtualization ? tableParentRef : undefined}
            className={cn(useTableVirtualization && 'max-h-[70vh] overflow-auto')}
          >
          <div className="divide-y divide-border">
            {useTableVirtualization && tableTopPadding > 0 ? (
              <div style={{ height: tableTopPadding }} aria-hidden="true" />
            ) : null}
            {(useTableVirtualization
              ? tableVirtualItems.map((vi) => ({ task: sortedTasks[vi.index]!, key: `virt-${vi.key}` }))
              : sortedTasks.map((task) => ({ task, key: task.id }))
            ).map(({ task, key }) => {
              const dynamicStatus = listStatusByKey[task.status]
              const fallback = DEFAULT_STATUS_META[task.status]
              const meta: StatusMeta = dynamicStatus
                ? { label: dynamicStatus.name, color: dynamicStatus.color, dot: '', pill: '' }
                : fallback ?? { label: task.status, color: '#94a3b8', dot: 'bg-zinc-400', pill: 'bg-muted/60 text-muted-foreground border-border' }
              const isSelected = selected.has(task.id)
              const isEditing = editingTitleId === task.id
              const assignees = task.assignees ?? []
              const taskCustom = customFieldByTask[task.id] ?? {}
              return (
                <div
                  key={key}
                  className={cn(
                    'group flex items-stretch h-9 text-sm transition-colors hover:bg-muted/60 even:bg-muted/30',
                    isSelected && 'bg-accent/10',
                  )}
                >
                  {/* Checkbox */}
                  <div className="w-9 px-3 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(task.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 rounded border-border accent-brand-700 cursor-pointer"
                      aria-label={t('list.table.selectTaskAria', { title: task.title })}
                    />
                  </div>

                  {/* Title */}
                  <div
                    className="flex-1 min-w-[240px] px-3 flex items-center cursor-pointer"
                    onClick={() => {
                      if (isEditing) return
                      if (openClickTimer.current) clearTimeout(openClickTimer.current)
                      openClickTimer.current = setTimeout(() => {
                        openClickTimer.current = null
                        onOpenTask(task.id)
                      }, 200)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      if (openClickTimer.current) {
                        clearTimeout(openClickTimer.current)
                        openClickTimer.current = null
                      }
                      setTitleDraft(task.title)
                      setEditingTitleId(task.id)
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={() => void commitTitle(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitTitle(task)
                          } else if (e.key === 'Escape') {
                            setEditingTitleId(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-7 bg-card border border-border rounded px-2 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    ) : (
                      <span
                        className={cn(
                          'truncate font-medium inline-flex items-center gap-1',
                          (task.statusCategory === 'closed' || task.status === 'done') && 'line-through text-muted-foreground',
                        )}
                      >
                        {task.isMilestone && rowFeatures.milestones && (
                          <Diamond className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" data-testid="row-milestone" />
                        )}
                        <TaskTypeMark type={task.taskType} />
                        {task.title}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  {showCol('col:status') && (
                  <div data-testid="list-table-status-cell" className="w-36 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatusOpenFor((cur) => (cur === task.id ? null : task.id))
                        setPriorityOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border"
                      style={pillStyleFor(meta.color)}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                      {resolveStatusLabel(task.status, dynamicStatus?.name, t)}
                    </button>
                    {statusOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-44 rounded-md border border-border bg-card shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(listStatusList.length > 0
                          ? listStatusList
                          : Object.entries(DEFAULT_STATUS_META).map(([k, m], i) => ({
                              id: k,
                              key: k,
                              name: m.label,
                              color: m.color,
                              position: i,
                            }))
                        ).map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left"
                            onClick={async () => {
                              setStatusOpenFor(null)
                              if (task.status !== s.key) {
                                await onPatchTask(task.id, { status: s.key })
                              }
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {resolveStatusLabel(s.key, s.name, t)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Priority */}
                  {showCol('col:priority') && (
                  <div className="w-28 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPriorityOpenFor((cur) => (cur === task.id ? null : task.id))
                        setStatusOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-foreground"
                    >
                      <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[task.priority])} />
                      <span className="capitalize">{t(PRIORITY_LABEL_KEYS[task.priority])}</span>
                    </button>
                    {priorityOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-36 rounded-md border border-border bg-card shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {PRIORITY_ORDER.map((p) => (
                          <button
                            key={p}
                            type="button"
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left capitalize"
                            onClick={async () => {
                              setPriorityOpenFor(null)
                              if (task.priority !== p) {
                                await onPatchTask(task.id, { priority: p })
                              }
                            }}
                          >
                            <Flag className={cn('h-3.5 w-3.5', PRIORITY_COLORS[p])} />
                            {t(PRIORITY_LABEL_KEYS[p])}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Assignees */}
                  {showCol('col:assignees') && (
                  <div className="w-28 px-3 flex items-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAssigneeOpenFor((cur) => (cur === task.id ? null : task.id))
                        setStatusOpenFor(null)
                        setPriorityOpenFor(null)
                        setDateOpenFor(null)
                      }}
                      className="w-full text-left"
                    >
                      {assignees.length === 0 ? (
                        <span className="text-muted-foreground text-xs">{t('list.table.assign')}</span>
                      ) : (
                        <div className="flex -space-x-1">
                          {assignees.slice(0, 3).map((a) => {
                            const label = a.user?.displayName?.[0]?.toUpperCase() ?? '?'
                            return (
                              <div
                                key={a.userId}
                                className="h-5 w-5 rounded-full bg-brand-300 text-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card"
                                title={a.user?.displayName ?? ''}
                              >
                                {label}
                              </div>
                            )
                          })}
                          {assignees.length > 3 && (
                            <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
                              +{assignees.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                    {assigneeOpenFor === task.id && (
                      <div
                        className="absolute top-full left-3 mt-1 z-20 w-56 rounded-md border border-border bg-card shadow-lg py-1 max-h-56 overflow-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {workspaceMembers.map((member) => {
                          const isAssigned = assignees.some((a) => a.userId === member.userId)
                          return (
                            <button
                              key={member.userId}
                              type="button"
                              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted text-left"
                              onClick={async () => {
                                if (isAssigned) {
                                  await api(`/tasks/${task.id}/assignees/${member.userId}`, { method: 'DELETE' })
                                } else {
                                  await api(`/tasks/${task.id}/assignees`, {
                                    method: 'POST',
                                    body: JSON.stringify({ userId: member.userId }),
                                  })
                                }
                                await onRefresh()
                              }}
                            >
                              <span className="truncate">{member.displayName || member.email}</span>
                              <span className={cn('text-[10px]', isAssigned ? 'text-emerald-600' : 'text-muted-foreground')}>
                                {isAssigned ? t('list.table.assigned') : t('list.table.add')}
                              </span>
                            </button>
                          )
                        })}
                        {workspaceMembers.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('list.table.noMembers')}</div>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Due date */}
                  {showCol('col:due') && (
                  <div className="w-28 px-3 flex items-center relative">
                    {dateOpenFor === task.id ? (
                      <input
                        autoFocus
                        type="date"
                        defaultValue={task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : ''}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setDateOpenFor(null)}
                        onChange={async (e) => {
                          const val = e.target.value
                          setDateOpenFor(null)
                          await onPatchTask(task.id, {
                            dueDate: val ? new Date(val).toISOString() : null,
                          })
                        }}
                        className="h-6 text-xs bg-card border border-border rounded px-1 outline-none focus:ring-1 focus:ring-brand-500 tabular-nums"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDateOpenFor(task.id)
                          setStatusOpenFor(null)
                          setPriorityOpenFor(null)
                        }}
                        className="inline-flex items-center gap-1 text-xs tabular-nums hover:text-foreground"
                      >
                        {task.dueDate ? (
                          <>
                            <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                            <span>{shortDate(new Date(task.dueDate), locale)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </button>
                    )}
                  </div>
                  )}

                  {/* Created */}
                  {showCol('col:created') && (
                  <div className="w-24 px-3 flex items-center text-xs text-muted-foreground tabular-nums">
                    {task.createdAt ? relativeTime(task.createdAt, locale) : '—'}
                  </div>
                  )}

                  {customColumns.map((field) => {
                    const editable = INLINE_EDITABLE_TYPES.has(field.type)
                    const open =
                      editable && customOpen?.taskId === task.id && customOpen.fieldId === field.id
                    const current = taskCustom[field.id]
                    const valueLabel = customCellText(field, current, t)

                    return (
                      <div key={field.id} className="w-36 px-3 flex items-center relative">
                        {!editable ? (
                          /*
                           * 0146 — READ-ONLY, and it opens nothing.
                           *
                           * A `people`, `tasks`, `signature` or derived field
                           * has no editor in this grid; until now clicking one
                           * opened a text box that could only ever produce a
                           * 400. The cell says what it holds and sends the
                           * reader to the task sheet, where the real editor is.
                           */
                          <span
                            data-testid={`custom-cell-readonly-${task.id}-${field.id}`}
                            title={t('list.table.cellEditOnTask')}
                            className="text-xs truncate text-left w-full text-muted-foreground"
                          >
                            {valueLabel}
                          </span>
                        ) : open ? (
                          <CustomFieldEditor
                            field={field}
                            currentValue={current}
                            onCancel={() => setCustomOpen(null)}
                            onSave={async (nextValue) => {
                              setCustomOpen(null)
                              await api(`/workspaces/${workspaceId}/tasks/${task.id}/custom-fields/${field.id}`, {
                                method: 'PUT',
                                body: { value: nextValue },
                              })
                              await qc.invalidateQueries({
                                queryKey: ['task-custom-fields-batch', workspaceId, projectId],
                              })
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            data-testid={`custom-cell-open-${task.id}-${field.id}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setCustomOpen({ taskId: task.id, fieldId: field.id })
                            }}
                            className="text-xs truncate text-left hover:text-foreground w-full"
                          >
                            {valueLabel}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {useTableVirtualization && tableBottomPadding > 0 ? (
              <div style={{ height: tableBottomPadding }} aria-hidden="true" />
            ) : null}

            {/* Add task row */}
            <div className="flex items-center h-9">
              {addActive ? (
                <div className="flex-1 px-3 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    autoFocus
                    value={addDraft}
                    onChange={(e) => setAddDraft(e.target.value)}
                    onBlur={() => void submitAdd()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void submitAdd()
                      } else if (e.key === 'Escape') {
                        setAddDraft('')
                        setAddActive(false)
                      }
                    }}
                    placeholder={t('list.newTaskPlaceholder')}
                    className="flex-1 h-7 bg-transparent text-sm outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddActive(true)}
                  className="w-full h-full flex items-center gap-2 px-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-left"
                >
                  <Plus className="h-4 w-4" />
                  {t('list.addTask')}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}

function CustomFieldEditor({
  field,
  currentValue,
  onSave,
  onCancel,
}: {
  field: CustomFieldDef
  currentValue: unknown
  onSave: (nextValue: string | number | boolean | null) => Promise<void> | void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>(currentValue == null ? '' : String(currentValue))
  const [checked, setChecked] = useState(Boolean(currentValue))
  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          autoFocus
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            const next = e.target.checked
            setChecked(next)
            void onSave(next)
          }}
        />
      </label>
    )
  }
  if (field.type === 'dropdown') {
    return (
      <select
        autoFocus
        className="h-6 w-full text-xs bg-card border border-border rounded px-1"
        value={draft}
        onBlur={onCancel}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          void onSave(next || null)
        }}
      >
        <option value="">{t('list.none')}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }
  /*
   * 0146 — T-shirt Size is a FIXED set, so it gets the set rather than a text
   * box. A free-text cell over it accepts "Large", sends it, and the API
   * refuses everything that is not one of the five.
   */
  if (field.type === 'tshirt_size') {
    return (
      <select
        autoFocus
        className="h-6 w-full text-xs bg-card border border-border rounded px-1"
        value={draft}
        onBlur={onCancel}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          void onSave(next || null)
        }}
      >
        <option value="">{t('list.none')}</option>
        {TSHIRT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size.toUpperCase()}
          </option>
        ))}
      </select>
    )
  }
  const isNumeric = field.type === 'number' || field.type === 'money'
  const inputType = isNumeric ? 'number' : field.type === 'date' ? 'date' : 'text'
  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (isNumeric) {
          const asNum = draft.trim() ? Number(draft) : null
          void onSave(Number.isFinite(asNum as number) ? asNum : null)
        } else {
          void onSave(draft.trim() || null)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      className="h-6 w-full text-xs bg-card border border-border rounded px-1"
    />
  )
}

/**
 * The trailing column on the board that creates a new status.
 *
 * A board "group" *is* a status here, so this writes a real status row rather
 * than a board-local grouping — which is what makes the new column survive a
 * reload and show up in every other view.
 */
function AddBoardGroup({ onAdd }: { onAdd: (name: string) => Promise<void> | void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-border/70 bg-transparent min-h-40 flex items-center justify-center text-sm text-muted-foreground hover:border-border hover:bg-card/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        {t('list.board.addGroup')}
      </button>
    )
  }
  return (
    <form
      className="rounded-lg border border-border bg-muted/30 min-h-40 flex flex-col items-stretch justify-center gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || saving) return
        setSaving(true)
        try {
          await onAdd(trimmed)
          setName('')
          setOpen(false)
        } finally {
          setSaving(false)
        }
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('list.board.addGroupPlaceholder')}
        aria-label={t('list.board.addGroup')}
        onKeyDown={(e) => { if (e.key === 'Escape') { setName(''); setOpen(false) } }}
        className="h-8 rounded border border-border bg-background px-2 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1" disabled={!name.trim() || saving}>
          {saving ? t('common.saving') : t('common.add')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setName(''); setOpen(false) }}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

function BoardColumn({
  status,
  tasks,
  onOpenTask,
  collapsed,
  onToggleCollapse,
  wipLimit,
  onSetWipLimit,
  onAddTask,
  onRename,
  showWip = true,
  cardSize = 'medium',
  cardCover = 'image',
  stackFields = false,
  showEmptyFields = true,
}: {
  status: TaskStatus
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  wipLimit?: number
  onSetWipLimit: (n: number | null) => void
  onAddTask: (title: string) => Promise<void> | void
  /** Rename the underlying status. Absent when the caller cannot edit statuses. */
  onRename?: (name: string) => Promise<void> | void
  /** §V2-06 — off when the space has switched Work in Progress Limits off. */
  showWip?: boolean
  /** §V2-S13 `10:35` — the Customize panel's Card size and Card cover. */
  cardSize?: CardSize
  cardCover?: CardCover
  /** §V2-S13 `10:35` — "Stack fields" and "Show empty fields", for the cards. */
  stackFields?: boolean
  showEmptyFields?: boolean
}) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const { isOver, setNodeRef } = useDroppable({
    id: `status:${status}`,
  })
  const meta = useStatusMeta(status)
  const [addTitle, setAddTitle] = useState('')
  const [editingWip, setEditingWip] = useState(false)
  const overWip = wipLimit != null && tasks.length > wipLimit

  return (
    <div
      ref={setNodeRef}
      /*
       * §V2-S13 `10:35` — the column states "Collapse empty columns" acts on.
       * The board had no testid of its own at all, so "the empty lane is shut
       * and the full one is not" had nothing to be asserted against except the
       * cards inside it, which is the same measurement the collapse removes.
       */
      data-testid="board-column"
      data-status={status}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-count={tasks.length}
      className={cn(
        'rounded-lg border border-border bg-muted/30 flex flex-col min-h-40 transition-colors',
        isOver && 'ring-2 ring-brand-500 bg-accent/10',
        overWip && 'ring-1 ring-red-400/60',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={onToggleCollapse}
          /*
           * §V2-S13 `10:35` — named, because "Collapse empty columns" has to
           * leave THIS working. `.locator('button').first()` would have found
           * it today and started pressing the WIP control the day the header's
           * two buttons swapped order.
           */
          data-testid="board-column-toggle"
          className="text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? t('list.board.expandColumnAria') : t('list.board.collapseColumnAria')}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
        {renaming && onRename ? (
          // Renaming here edits the status itself, which is why it is the same
          // write the Statuses dialog makes — not a board-only label.
          <input
            autoFocus
            defaultValue={meta.label}
            aria-label={t('list.board.renameColumnAria', { name: meta.label })}
            onBlur={async (e) => {
              const next = e.target.value.trim()
              setRenaming(false)
              if (next && next !== meta.label) await onRename(next)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') { setRenaming(false) }
            }}
            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-sm font-medium"
          />
        ) : (
          <h3
            className={cn('font-medium text-sm', onRename && 'cursor-text hover:underline decoration-dotted')}
            title={onRename ? t('list.board.renameColumn') : undefined}
            onClick={() => onRename && setRenaming(true)}
          >
            {meta.label}
          </h3>
        )}
        <span className={cn('text-xs tabular-nums', overWip ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
          {tasks.length}
          {wipLimit != null ? `/${wipLimit}` : ''}
        </span>
        {editingWip ? (
          <input
            type="number"
            min={0}
            autoFocus
            defaultValue={wipLimit ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim()
              onSetWipLimit(v === '' ? null : Math.max(0, parseInt(v, 10) || 0))
              setEditingWip(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingWip(false)
            }}
            placeholder={t('list.board.wipPlaceholder')}
            className="ml-auto h-6 w-14 rounded border border-border bg-background px-1 text-[11px]"
          />
        ) : (
          // §V2-06 — a space that has switched Work in Progress Limits off gets
          // no control to set one. An existing limit still shows in the count
          // above: hiding the number would make a column look uncapped while
          // the cap was still in force.
          showWip && (
            <button
              type="button"
              onClick={() => setEditingWip(true)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
              title={t('list.board.setWipTitle')}
              data-testid="board-set-wip"
            >
              {wipLimit != null ? t('list.board.wipEdit') : t('list.board.setWip')}
            </button>
          )
        )}
      </div>
      {!collapsed && (
        <>
          {/*
            §V2-S13 `10:35` — the part "Collapse empty columns" actually
            removes, named so a check can measure it.

            THE COLUMN'S OWN BOX CANNOT BE THAT MEASUREMENT. The board is a
            CSS grid, so every column stretches to the tallest in its row, and
            the wrapper carries `min-h-40` on top of that — a collapsed lane
            and an open one measure the same 160px either way. A height
            comparison on the column would have failed on a correct build and
            told the reader the collapse was broken.
          */}
          <div className="p-2 space-y-2 flex-1" data-testid="board-column-body">
            {tasks.length >= BOARD_VIRTUALIZE_THRESHOLD ? (
              <VirtualizedBoardCards
                tasks={tasks}
                onOpenTask={onOpenTask}
                size={cardSize}
                cover={cardCover}
                stackFields={stackFields}
                showEmptyFields={showEmptyFields}
              />
            ) : (
              tasks.map((task) => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  onOpenTask={onOpenTask}
                  size={cardSize}
                  cover={cardCover}
                  stackFields={stackFields}
                  showEmptyFields={showEmptyFields}
                />
              ))
            )}
            {tasks.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">{t('list.board.dropHere')}</div>
            )}
          </div>
          <form
            className="p-2 pt-0"
            onSubmit={async (e) => {
              e.preventDefault()
              const trimmed = addTitle.trim()
              if (!trimmed) return
              setAddTitle('')
              await onAddTask(trimmed)
            }}
          >
            <input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder={t('list.board.addTaskPlaceholder')}
              className="w-full h-8 rounded border border-dashed border-border/70 bg-transparent px-2 text-sm placeholder:text-muted-foreground hover:border-border hover:bg-card/60 focus:border-border focus:bg-card focus:outline-none"
            />
          </form>
        </>
      )}
    </div>
  )
}

function BoardTaskCard({
  task,
  onOpenTask,
  size = 'medium',
  cover = 'image',
  stackFields = false,
  showEmptyFields = true,
}: {
  task: TaskItem
  onOpenTask: (taskId: string) => void
  /** §V2-S13 `10:35` — "Card size  Medium ›". */
  size?: CardSize
  /** §V2-S13 `10:35` — "Card cover  Image ›". */
  cover?: CardCover
  /** §V2-S13 `10:35` — "Stack fields": one field per line instead of one row. */
  stackFields?: boolean
  /** §V2-S13 `10:35` — "Show empty fields": draw the ones this task has no value for. */
  showEmptyFields?: boolean
}) {
  const features = useSpaceFeatureFlags()
  const { t, locale } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task:${task.id}`,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const assignees = task.assignees ?? []
  const subtasks = task.subtasks ?? []
  const subtasksDone = subtasks.filter((s) => s.statusCategory === 'closed' || s.status === 'done').length
  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = due ? due.getTime() < Date.now() && !(task.statusCategory === 'closed' || task.status === 'done') : false
  const dims = CARD_SIZE_STYLE[size]
  /*
   * §V2-S13 frame `10:35` — the cover, drawn where the frame draws it.
   *
   * `coverUrl` is resolved server-side (`tasks.service.ts getTasksByList`) so
   * a stored image and a linked one are the same field here; `coverColor` is
   * the Gallery's colour, which is a cover too and the only one a workspace
   * without object storage can have. An image wins when both are set, which is
   * the order the picker writes them in. `coverOffsetY` is Reposition.
   */
  const coverImage = cover === 'image' ? task.coverUrl ?? null : null
  const coverColor = cover === 'image' && !coverImage ? task.coverColor ?? null : null
  const hasCover = !!coverImage || !!coverColor

  return (
    <button
      ref={setNodeRef}
      style={style}
      data-testid="board-task-card"
      data-task-id={task.id}
      data-card-size={size}
      className={cn(
        'w-full text-left rounded border border-border bg-card hover:bg-muted overflow-hidden',
        hasCover ? 'p-0' : dims.pad,
        isDragging && 'opacity-50',
      )}
      onClick={() => onOpenTask(task.id)}
      {...listeners}
      {...attributes}
    >
      {hasCover && (
        <div
          data-testid="board-card-cover"
          data-cover-kind={coverImage ? 'image' : 'color'}
          className={cn('w-full overflow-hidden bg-muted', dims.cover)}
          style={coverColor ? { background: coverColor } : undefined}
        >
          {coverImage && (
            <img
              src={coverImage}
              alt={t('list.card.coverAlt', { title: task.title })}
              loading="lazy"
              className="h-full w-full object-cover"
              style={{ objectPosition: `50% ${task.coverOffsetY ?? 50}%` }}
            />
          )}
        </div>
      )}
      <div className={cn(hasCover && dims.pad)}>
      <div className="flex items-start gap-2">
        {task.isMilestone
          ? <Diamond className="h-3 w-3 mt-0.5 shrink-0 fill-amber-400 text-amber-500" />
          : <Flag className={cn('h-3 w-3 mt-0.5 shrink-0', PRIORITY_COLORS[task.priority])} />}
        <div className={cn('font-medium leading-snug', dims.title)}>{task.title}</div>
      </div>
      {features.tags && (task.labels?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels!.slice(0, 3).map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
          {task.labels!.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{task.labels!.length - 3}</span>
          )}
        </div>
      )}
      {/*
        §V2-S13 frame `10:35` — the card's FIELDS, which is what "Stack fields"
        and "Show empty fields" are about.

        The card's three fields are Due date, Assignees and Subtasks: the
        things a task either has a value for or does not. The blocker warning
        below is deliberately NOT one of them — it is a badge that appears when
        something is wrong, and "no blockers" drawn as an empty field would be
        a placeholder for the normal case on every card on the board.

        Built as a list rather than four inline conditionals because both
        switches need the same answer: Show empty fields decides which entries
        survive, Stack fields decides how the survivors are laid out, and with
        conditionals each one would have had to be written into every branch.
      */}
      {(() => {
        const fields: { key: string; filled: boolean; node: ReactNode }[] = [
          {
            key: 'due',
            filled: !!due,
            node: due ? (
              <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-500 font-medium')}>
                <CalendarIcon className="h-3 w-3" />
                {shortDate(due, locale)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 opacity-60">
                <CalendarIcon className="h-3 w-3" />
                {t('list.card.fieldEmptyDue')}
              </span>
            ),
          },
          {
            key: 'subtasks',
            filled: subtasks.length > 0,
            node: subtasks.length > 0 ? (
              <span className="inline-flex items-center gap-1" title={t('list.board.subtasksDoneTitle')}>
                ☑ {subtasksDone}/{subtasks.length}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 opacity-60">☑ {t('list.card.fieldEmptySubtasks')}</span>
            ),
          },
          {
            key: 'assignees',
            filled: assignees.length > 0,
            node: assignees.length > 0 ? (
              <span className="flex -space-x-1.5">
                {assignees.slice(0, 3).map((a) => (
                  <span key={a.userId} className="ring-1 ring-card rounded-full">
                    <PersonAvatar name={a.user?.displayName ?? '?'} size="xs" />
                  </span>
                ))}
                {assignees.length > 3 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] ring-1 ring-card">
                    +{assignees.length - 3}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 opacity-60">
                <Users className="h-3 w-3" />
                {t('list.card.fieldEmptyAssignees')}
              </span>
            ),
          },
        ]
        const shown = fields.filter((f) => f.filled || showEmptyFields)
        const blocked = (task.openBlockerCount ?? 0) > 0
        if (shown.length === 0 && !blocked) return null
        return (
          <div
            data-testid="board-card-meta"
            data-stacked={stackFields ? 'true' : 'false'}
            data-fields={shown.map((f) => f.key).join(',')}
            className={cn(
              'mt-1.5 text-[11px] text-muted-foreground',
              stackFields ? 'flex flex-col items-start gap-1' : 'flex items-center gap-2 flex-wrap',
            )}
          >
            {shown.map((f) => (
              <span
                key={f.key}
                data-testid={`board-card-field-${f.key}`}
                data-filled={f.filled ? 'true' : 'false'}
                className={cn(!stackFields && f.key === 'assignees' && 'ml-auto')}
              >
                {f.node}
              </span>
            ))}
            {blocked && (
              <span className="text-amber-700 dark:text-amber-300" data-testid="board-card-blocked">
                {t('list.blockedBy', { count: task.openBlockerCount ?? 0 })}
              </span>
            )}
          </div>
        )
      })()}
      </div>
    </button>
  )
}

function VirtualizedBoardCards({
  tasks,
  onOpenTask,
  size = 'medium',
  cover = 'image',
  stackFields = false,
  showEmptyFields = true,
}: {
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
  size?: CardSize
  cover?: CardCover
  stackFields?: boolean
  showEmptyFields?: boolean
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const dims = CARD_SIZE_STYLE[size]
  const cardVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    /*
     * §V2-S13 `10:35` — the estimate follows the size, and grows again when a
     * cover is drawn. A density control whose virtualizer kept one number
     * would scroll a long column to the wrong place at every size but Medium,
     * which reads as the board being broken rather than as the setting working.
     *
     * Stacking is in here for the same reason: three fields on three lines is
     * roughly two lines taller than three fields on one, and an estimate that
     * ignored it would leave a stacked column's scrollbar describing a board
     * two thirds the height of the one on screen.
     */
    estimateSize: () =>
      dims.estimate + (cover === 'image' ? dims.coverPx : 0) + (stackFields ? BOARD_STACKED_FIELDS_PX : 0),
    overscan: 8,
  })

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto">
      <div className="relative w-full" style={{ height: `${cardVirtualizer.getTotalSize()}px` }}>
        {cardVirtualizer.getVirtualItems().map((item) => {
          const task = tasks[item.index]
          return (
            <div
              key={task.id}
              ref={cardVirtualizer.measureElement}
              data-index={item.index}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <BoardTaskCard
                task={task}
                onOpenTask={onOpenTask}
                size={size}
                cover={cover}
                stackFields={stackFields}
                showEmptyFields={showEmptyFields}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const BULK_PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

// ---------------------------------------------------------------------------
// Gantt view — timeline bars, dependency arrows, critical-path highlight, and
// group-by swimlanes (Plan §5.4). Bars are click-to-open and can be dragged
// horizontally to reschedule their whole span (snapped to the day grid) via the
// same PATCH /tasks/:id path as the calendar; a day/week/month zoom control
// varies the per-day column width.
// ---------------------------------------------------------------------------
// Per-day column width by zoom level. "day" is the most zoomed-in (widest
// columns); "month" packs many days into the viewport.
type GanttZoom = 'day' | 'week' | 'month'
const GANTT_DAY_WIDTHS: Record<GanttZoom, number> = { day: 36, week: 18, month: 7 }
// Below this column width the per-day number labels are dropped (too cramped).
const GANTT_DAYNUM_MIN_W = 16
// Pointer travel (px) before a bar press is treated as a drag rather than a click.
const GANTT_DRAG_THRESHOLD = 4
const GANTT_ROW_H = 34
const GANTT_LABEL_W = 220
const GANTT_HEADER_H = 44
const GANTT_BAR_H = 18

// A single draggable Gantt bar. A press that moves past GANTT_DRAG_THRESHOLD
// becomes a reschedule (snapped to whole days); a press that doesn't is a click
// that opens the task — keeping click-to-open working alongside drag (§5.4).
function GanttBar({
  task,
  x,
  w,
  top,
  dayW,
  critical,
  done,
  locale,
  onOpen,
  onReschedule,
}: {
  task: TaskItem
  x: number
  w: number
  top: number
  dayW: number
  critical: boolean
  done: boolean
  locale: string
  onOpen: (taskId: string) => void
  onReschedule: (task: TaskItem, deltaDays: number) => void
}) {
  const [dragDx, setDragDx] = useState<number | null>(null)
  const state = useRef<{ startX: number; moved: boolean } | null>(null)
  const start = task.startDate
    ? startOfDay(new Date(task.startDate))
    : task.dueDate
      ? startOfDay(new Date(task.dueDate))
      : null
  const end = task.dueDate
    ? startOfDay(new Date(task.dueDate))
    : task.startDate
      ? startOfDay(new Date(task.startDate))
      : null

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture is best-effort
    }
    state.current = { startX: e.clientX, moved: false }
    setDragDx(0)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!state.current) return
    const dx = e.clientX - state.current.startX
    if (Math.abs(dx) > GANTT_DRAG_THRESHOLD) state.current.moved = true
    setDragDx(dx)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = state.current
    const dx = dragDx ?? 0
    state.current = null
    setDragDx(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // release is best-effort
    }
    if (st && st.moved) {
      const days = Math.round(dx / dayW)
      if (days !== 0) onReschedule(task, days)
    } else {
      onOpen(task.id)
    }
  }

  const snapDays = dragDx != null ? Math.round(dragDx / dayW) : 0
  const dragging = dragDx != null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={task.title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(task.id)
        }
      }}
      className={cn(
        'absolute flex touch-none select-none items-center truncate rounded px-1.5 text-[10px] text-white shadow-sm',
        dragging ? 'z-20 cursor-grabbing ring-2 ring-white/70' : 'cursor-grab',
        critical ? 'bg-red-500' : done ? 'bg-emerald-500/80' : 'bg-brand-700',
      )}
      style={{ left: x + snapDays * dayW, top, width: w, height: GANTT_BAR_H }}
      title={
        start && end
          ? `${task.title} · ${shortDate(start, locale)} – ${shortDate(end, locale)}`
          : task.title
      }
    >
      <span className="pointer-events-none truncate">{task.title}</span>
    </div>
  )
}

/**
 * §V2-13 — TEAM VIEW, frames `07:40` and `09:25`.
 *
 * Team appears three times in the frames: in the required-views list at
 * `07:10`, in the list's view tabs at `07:40`, and at `09:25` where ClickUp
 * PAYWALLS it and the paywall teaches what it would show — a member card, a
 * 16/8 load, a 25% donut, and Ready / In Progress / Review.
 *
 * IT IS GATED, and the rows are computed on the SERVER — see
 * `tasks.controller.ts` `getTeamView`. The re-audit's earlier note here argued
 * the opposite ("gating it would be inventing a tier to take it away"), and
 * that note was a *stale reason*: `[09:26]` is not ambiguous — "yeh cheez ke
 * liye humein of course BUY karna parega" — and the frame she is describing is
 * a paywall with a price on it. The lesson banked with it is why the rollup
 * moved: a paywall over arithmetic the browser does is not a paywall, because
 * there is nothing on the other side of it for the server to refuse.
 *
 * ONE ROW PER PERSON, AND ONE FOR NOBODY. Unassigned work is the column most
 * worth seeing on a board about who is doing what: a view that silently
 * dropped it would report a team as fully allocated while work sat unowned.
 */
type TeamRow = { id: string; name: string; done: number; total: number; pct: number; tasks: Array<{ id: string; title: string }> }

function TeamView({
  listId,
  includeArchived,
  stamp,
  onOpenTask,
  onUnlock,
}: {
  listId: string
  includeArchived: boolean
  /** The list's last refresh, so the rollup moves when the rows do. */
  stamp: number
  onOpenTask: (id: string) => void
  /** Re-opens the paywall when the server says this workspace cannot have it. */
  onUnlock: () => void
}) {
  const { t } = useTranslation()

  const rollup = useQuery({
    queryKey: ['team-view', listId, includeArchived, stamp],
    queryFn: () =>
      api<TeamRow[]>(
        `/tasks/list/${listId}/team?includeArchived=${includeArchived}` +
          `&unassignedLabel=${encodeURIComponent(t('list.team.unassigned'))}`,
      ),
    // The stamp is part of the key, so every list refresh is a NEW key and
    // would otherwise blank the view back to a spinner while somebody is
    // reading it. Keep the previous rows until the next ones land.
    placeholderData: (prev: TeamRow[] | undefined) => prev,
    retry: false,
  })

  /*
   * A 403 here is the plan refusing, not a bug. It is reachable without ever
   * pressing the tab — a space whose DEFAULT view is Team opens straight onto
   * it — so the locked state lives in the view rather than only on the tab.
   */
  if (rollup.error instanceof ApiError && rollup.error.status === 403) {
    return (
      <Card className="p-6 text-center space-y-3" data-testid="team-view-locked">
        <p className="text-sm text-muted-foreground">{t('gate.notOnYourPlan')}</p>
        <Button size="sm" onClick={onUnlock} data-testid="team-view-unlock">
          {t('gate.unlock', { feature: t('gate.teamView') })}
        </Button>
      </Card>
    )
  }

  const groups = rollup.data ?? []

  if (rollup.isLoading) {
    /*
     * A SKELETON IN THE SHAPE OF THE ROLLUP, not the word "Loading".
     *
     * `loading-states.mjs` refuses any reference to a catalog key whose value
     * starts with "Loading", and its comment (`:466-471`) records why the
     * softer version of that rule was wrong: a surface that is waiting should
     * either say what it is doing or draw the shape that is coming. This drew
     * `common.loading` centred in a `p-6` Card, so the rows then landed at a
     * different height and the view jumped.
     *
     * Three rows because the loaded state is one Card per person and three is
     * the smallest number that reads as a list rather than as a single box.
     */
    return (
      <div className="space-y-2" data-testid="team-view-loading" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <ListSkeleton rows={1} rowClassName="h-4 w-40" className="space-y-0" />
                <ListSkeleton rows={1} rowClassName="h-3 w-24" className="space-y-0" />
              </div>
              <div className="w-28 shrink-0 space-y-1">
                <ListSkeleton rows={1} rowClassName="h-1.5" className="space-y-0" />
                <ListSkeleton rows={1} rowClassName="h-2.5 w-8 ml-auto" className="space-y-0" />
              </div>
            </div>
            <div className="mt-2">
              <ListSkeleton rows={3} rowClassName="h-4" className="space-y-0.5" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <Card className="p-6 text-center" data-testid="team-view-empty">
        <p className="text-sm text-muted-foreground">{t('list.team.empty')}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-2" data-testid="team-view">
      {groups.map((g) => (
        <Card key={g.id} className="p-3" data-testid="team-view-row">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" data-testid="team-view-name">{g.name}</div>
              <div className="text-[11px] text-muted-foreground" data-testid="team-view-load">
                {t('list.team.load', { done: g.done, total: g.total })}
              </div>
            </div>
            <div className="w-28 shrink-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${g.pct}%` }} />
              </div>
              <div className="mt-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
                {g.pct}%
              </div>
            </div>
          </div>
          <ul className="mt-2 space-y-0.5">
            {g.tasks.slice(0, 8).map((task) => (
              <li key={`${g.id}-${task.id}`}>
                <button
                  type="button"
                  data-testid="team-view-task"
                  onClick={() => onOpenTask(task.id)}
                  className="w-full truncate rounded px-1.5 py-0.5 text-left text-[12px] hover:bg-muted/50"
                >
                  {task.title}
                </button>
              </li>
            ))}
            {g.tasks.length > 8 && (
              <li className="px-1.5 text-[11px] text-muted-foreground">
                {t('list.team.andMore', { n: g.tasks.length - 8 })}
              </li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function GanttView({
  tasks,
  groupBy,
  onOpenTask,
  onReschedule,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority' | 'assignee'
  onOpenTask: (taskId: string) => void
  onReschedule: (task: TaskItem, deltaDays: number) => void
}) {
  const { t, locale } = useTranslation()
  const ordered = useOrderedStatuses()
  const [zoom, setZoom] = useState<GanttZoom>('week')
  const dayW = GANTT_DAY_WIDTHS[zoom]

  // Each task's [start,end]; a task needs at least a due or start date to plot.
  const scheduled = useMemo(() => {
    return tasks
      .map((task) => {
        const s = task.startDate ? startOfDay(new Date(task.startDate)) : null
        const d = task.dueDate ? startOfDay(new Date(task.dueDate)) : null
        if (!s && !d) return null
        const start = s ?? d!
        const end = d ?? s!
        return { task, start: start <= end ? start : end, end: start <= end ? end : start }
      })
      .filter((x): x is { task: TaskItem; start: Date; end: Date } => x != null)
  }, [tasks])

  const range = useMemo(() => {
    if (scheduled.length === 0) return null
    let min = scheduled[0].start
    let max = scheduled[0].end
    for (const s of scheduled) {
      if (s.start < min) min = s.start
      if (s.end > max) max = s.end
    }
    const start = addDays(min, -2)
    const end = addDays(max, 2)
    return { start, end, days: differenceInCalendarDays(end, start) + 1 }
  }, [scheduled])

  // Critical path: longest cumulative-duration chain through blockedBy edges.
  const criticalIds = useMemo(() => {
    const ids = new Set(scheduled.map((s) => s.task.id))
    return criticalPath(
      scheduled.map((s) => ({
        id: s.task.id,
        durationDays: differenceInCalendarDays(s.end, s.start) + 1,
        blockedBy: (s.task.blockedBy ?? []).filter((b) => ids.has(b)),
      })),
    )
  }, [scheduled])

  // Build swimlanes + a flat render order; assign each task a row index.
  const { flatRows, layout } = useMemo(() => {
    const groupsMap = new Map<string, { label: string; items: typeof scheduled }>()
    const groupKey = (task: TaskItem): { id: string; label: string } => {
      if (groupBy === 'assignee') {
        const a = task.assignees?.[0]
        return { id: a?.userId ?? '__unassigned__', label: a?.user?.displayName ?? t('list.group.unassigned') }
      }
      if (groupBy === 'priority') return { id: task.priority, label: t(PRIORITY_LABEL_KEYS[task.priority]) }
      const meta = ordered.find((s) => s.key === task.status)
      return { id: task.status, label: resolveStatusLabel(task.status, meta?.name, t) }
    }
    for (const s of scheduled) {
      const g = groupKey(s.task)
      if (!groupsMap.has(g.id)) groupsMap.set(g.id, { label: g.label, items: [] })
      groupsMap.get(g.id)!.items.push(s)
    }
    const rows: Array<{ kind: 'group'; label: string } | { kind: 'task'; s: (typeof scheduled)[number] }> = []
    const lay = new Map<string, { rowIdx: number; x: number; w: number }>()
    let idx = 0
    for (const [, group] of groupsMap) {
      rows.push({ kind: 'group', label: group.label })
      idx++
      const sorted = [...group.items].sort((a, b) => a.start.getTime() - b.start.getTime())
      for (const s of sorted) {
        if (range) {
          const x = differenceInCalendarDays(s.start, range.start) * dayW
          const w = Math.max(dayW, (differenceInCalendarDays(s.end, s.start) + 1) * dayW)
          lay.set(s.task.id, { rowIdx: idx, x, w })
        }
        rows.push({ kind: 'task', s })
        idx++
      }
    }
    return { flatRows: rows, layout: lay }
  }, [scheduled, groupBy, ordered, range, dayW, t])

  if (!range) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {t('list.gantt.noDatedTasks')}
      </Card>
    )
  }

  const timelineW = range.days * dayW
  const bodyH = flatRows.length * GANTT_ROW_H
  const showDayNums = dayW >= GANTT_DAYNUM_MIN_W
  const monthMarkers: Array<{ x: number; label: string }> = []
  for (let i = 0; i < range.days; i++) {
    const day = addDays(range.start, i)
    if (i === 0 || day.getDate() === 1) monthMarkers.push({ x: i * dayW, label: day.toLocaleDateString(locale, { month: 'short', year: 'numeric' }) })
  }

  // Arrow endpoints from blocker bar right-edge → blocked bar left-edge.
  const arrows: Array<{ id: string; d: string; critical: boolean }> = []
  for (const s of scheduled) {
    const to = layout.get(s.task.id)
    if (!to) continue
    for (const bId of s.task.blockedBy ?? []) {
      const from = layout.get(bId)
      if (!from) continue
      const y1 = GANTT_HEADER_H + from.rowIdx * GANTT_ROW_H + GANTT_ROW_H / 2
      const x1 = from.x + from.w
      const y2 = GANTT_HEADER_H + to.rowIdx * GANTT_ROW_H + GANTT_ROW_H / 2
      const x2 = to.x
      const midX = Math.max(x1 + 8, x2 - 8)
      const critical = criticalIds.has(s.task.id) && criticalIds.has(bId)
      arrows.push({
        id: `${bId}->${s.task.id}`,
        d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`,
        critical,
      })
    }
  }

  const todayX =
    differenceInCalendarDays(startOfDay(new Date()), range.start) * dayW

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="min-h-4">
          {criticalIds.size > 0 && (
            <>
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500 align-middle" /> {t('list.gantt.criticalPath')}
            </>
          )}
        </span>
        <div
          className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
          role="group"
          aria-label={t('list.gantt.zoomAria')}
        >
          {(['day', 'week', 'month'] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn(
                'rounded px-2 py-0.5',
                zoom === z ? 'bg-brand-700 text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {z === 'day' ? t('timeline.zoomDay') : z === 'week' ? t('timeline.zoomWeek') : t('timeline.zoomMonth')}
            </button>
          ))}
        </div>
      </div>
      <div className="flex">
        {/* Label column */}
        <div className="shrink-0 border-r border-border" style={{ width: GANTT_LABEL_W }}>
          <div style={{ height: GANTT_HEADER_H }} className="border-b border-border bg-muted/40" />
          {flatRows.map((row, i) =>
            row.kind === 'group' ? (
              <div
                key={`g-${i}`}
                style={{ height: GANTT_ROW_H }}
                className="flex items-center px-3 text-xs font-semibold text-foreground bg-muted/30 truncate"
              >
                {row.label}
              </div>
            ) : (
              <button
                key={row.s.task.id}
                onClick={() => onOpenTask(row.s.task.id)}
                style={{ height: GANTT_ROW_H }}
                className="flex w-full items-center px-3 text-left text-[13px] hover:bg-muted/40 truncate"
                title={row.s.task.title}
              >
                <span className="truncate">{row.s.task.title}</span>
              </button>
            ),
          )}
        </div>

        {/* Timeline */}
        <div className="overflow-x-auto flex-1">
          <div className="relative" style={{ width: timelineW, height: GANTT_HEADER_H + bodyH }}>
            {/* month markers + day grid */}
            <div className="absolute inset-x-0 top-0" style={{ height: GANTT_HEADER_H }}>
              {monthMarkers.map((m) => (
                <div
                  key={m.x}
                  className="absolute top-1 text-[10px] font-medium text-muted-foreground"
                  style={{ left: m.x + 2 }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            {Array.from({ length: range.days }).map((_, i) => {
              const day = addDays(range.start, i)
              const weekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={i}
                  className={cn('absolute top-0 border-l border-border/40', weekend && 'bg-muted/20')}
                  style={{ left: i * dayW, width: dayW, height: GANTT_HEADER_H + bodyH }}
                >
                  {showDayNums && (
                    <div className="text-center text-[9px] text-muted-foreground" style={{ marginTop: GANTT_HEADER_H - 14 }}>
                      {format(day, 'd')}
                    </div>
                  )}
                </div>
              )
            })}
            {/* today line */}
            {todayX >= 0 && todayX <= timelineW && (
              <div
                className="absolute top-0 w-px bg-red-400/70 z-10"
                style={{ left: todayX, height: GANTT_HEADER_H + bodyH }}
              />
            )}
            {/* dependency arrows */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={timelineW}
              height={GANTT_HEADER_H + bodyH}
            >
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
                </marker>
                <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" className="fill-red-500" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.id}
                  d={a.d}
                  fill="none"
                  className={a.critical ? 'stroke-red-500' : 'stroke-muted-foreground/50'}
                  strokeWidth={a.critical ? 1.6 : 1.2}
                  markerEnd={`url(#${a.critical ? 'gantt-arrow-crit' : 'gantt-arrow'})`}
                />
              ))}
            </svg>
            {/* bars — drag to reschedule (snapped to the day grid), click to open */}
            {flatRows.map((row, i) => {
              if (row.kind !== 'task') return null
              const lay = layout.get(row.s.task.id)
              if (!lay) return null
              const critical = criticalIds.has(row.s.task.id)
              const done = row.s.task.statusCategory === 'closed' || row.s.task.status === 'done'
              return (
                <GanttBar
                  key={row.s.task.id}
                  task={row.s.task}
                  x={lay.x}
                  w={lay.w}
                  top={GANTT_HEADER_H + i * GANTT_ROW_H + (GANTT_ROW_H - GANTT_BAR_H) / 2}
                  dayW={dayW}
                  critical={critical}
                  done={done}
                  locale={locale}
                  onOpen={onOpenTask}
                  onReschedule={onReschedule}
                />
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

function BulkActionBar({
  selectedIds,
  onClear,
  onApplied,
  workspaceMembers = [],
  moveLists = [],
}: {
  selectedIds: Set<string>
  onClear: () => void
  onApplied: () => Promise<void> | void
  workspaceMembers?: WorkspaceMember[]
  moveLists?: Array<{ id: string; name: string }>
}) {
  const { t, tCount } = useTranslation()
  const [busy, setBusy] = useState(false)
  const count = selectedIds.size
  const bulkStatuses = useOrderedStatuses()

  // Clear selection on Escape for a quick keyboard escape hatch.
  useEffect(() => {
    if (count === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, onClear])

  if (count === 0) return null

  const apply = async (patch: Record<string, unknown>) => {
    setBusy(true)
    try {
      await api('/tasks/bulk/update', {
        method: 'PATCH',
        body: JSON.stringify({ taskIds: Array.from(selectedIds), patch }),
      })
      await onApplied()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
        <span className="text-sm font-medium tabular-nums pl-1">{tCount('list.bulk.selected', count)}</span>
        <span className="h-4 w-px bg-border" />

        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            const status = e.target.value as TaskStatus
            void apply({ status })
            e.target.value = ''
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          aria-label={t('list.bulk.setStatusAria')}
        >
          <option value="">{t('list.bulk.setStatus')}</option>
          {bulkStatuses.map((s) => (
            <option key={s.key} value={s.key}>
              {resolveStatusLabel(s.key, s.name, t)}
            </option>
          ))}
        </select>

        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            const priority = e.target.value as TaskPriority
            void apply({ priority })
            e.target.value = ''
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize"
          aria-label={t('list.bulk.setPriorityAria')}
        >
          <option value="">{t('list.bulk.setPriority')}</option>
          {BULK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(PRIORITY_LABEL_KEYS[p])}
            </option>
          ))}
        </select>

        {workspaceMembers.length > 0 && (
          <select
            disabled={busy}
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              void apply({ assigneeIdsAdd: [e.target.value] })
              e.target.value = ''
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs max-w-[9rem]"
            aria-label={t('list.bulk.assignToAria')}
          >
            <option value="">{t('list.bulk.assign')}</option>
            {workspaceMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName || m.email}
              </option>
            ))}
          </select>
        )}

        {moveLists.length > 0 && (
          <select
            disabled={busy}
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              void apply({ listId: e.target.value })
              e.target.value = ''
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs max-w-[9rem]"
            aria-label={t('list.bulk.moveToListAria')}
          >
            <option value="">{t('list.bulk.moveToList')}</option>
            {moveLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm(tCount('list.bulk.archiveConfirm', count))) {
              void apply({ isArchived: true })
            }
          }}
          aria-label={t('list.bulk.archiveAria')}
        >
          <Archive className="h-3.5 w-3.5 text-red-400" />
        </Button>

        <span className="h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={onClear} aria-label={t('list.bulk.clearSelectionAria')}>
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Make a native `<details>` behave like the app's other popovers: closed by a
 * click outside it, AND by Escape.
 *
 * Escape is the half that was missing everywhere. `<details>` has no built-in
 * dismissal at all — the outside-click handler was added for the Fields picker
 * and Escape never was, so a keyboard user who opened one of these had no way
 * to close it without a mouse. `ui-sweep` presses Escape to close the Fields
 * picker between two of its sections and has been getting away with it because
 * the next click happened to close the panel instead.
 *
 * This is a robustness and accessibility fix. It is NOT offered as the cause of
 * any particular CI failure — that panel does close on the click that follows,
 * so it was not covering anything.
 */
function useDismissableDetails(ref: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = () => {
      if (ref.current?.open) ref.current.open = false
    }
    const onPointerDown = (e: PointerEvent) => {
      const d = ref.current
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ref])
}

/**
 * A toolbar chip that is on or off, and says which — `aria-pressed` so a
 * screen reader gets the state, and a label that changes with it so a sighted
 * person does not have to infer the state from a shade of background.
 */
function ToolbarToggle({
  active,
  onClick,
  label,
  icon,
  testId,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: ReactNode
  testId: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      title={label}
      className={cn(
        'h-8 shrink-0 px-2.5 flex items-center gap-1.5 rounded-md border text-[12px] transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border/80 bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * §V2-07 — the Customize panel, and "Export view" inside it.
 *
 * `[10:53]` "Yeh Customize pe aap click karoge — ab yeh dekh rahe ho: EXPORT
 * VIEW … aur aap is ko download kar lo." Frames `10:36` (board) and `11:14`
 * (list) show the panel this hangs off: a column of rows, of which Export view
 * is one, and which the rows above it will fill.
 *
 * Frame `10:58` shows the export section open, and it has four controls, not
 * one: **File format** `CSV | Excel`, **What to export** (Visible columns /
 * Task Names only / All columns), **Date format** and **Time format**, then
 * Download. All four are here.
 *
 * The download goes through fetch rather than a plain link because the API
 * wants an Authorization header, and an <a href> cannot carry one.
 */
/** One switch row of the Customize panel, drawn as the frame draws it. */
function PanelSwitch({
  label,
  icon,
  checked,
  onChange,
  testId,
  disabled,
  hint,
}: {
  label: string
  icon: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  testId: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={hint ?? label}
      disabled={disabled}
      data-testid={testId}
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-muted/40 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="flex items-center gap-2 text-left">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-4 w-7 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
            checked ? 'left-3.5' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/** A row of the Customize panel that does something rather than toggling. */
function PanelAction({
  label,
  icon,
  onClick,
  testId,
  disabled,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  testId: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-muted/40 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  )
}

/**
 * §V2-S13 frame `10:35` — a Customize row that NAMES ITS CURRENT VALUE and
 * opens on a chevron: `Card size   Medium ›`, `Card cover   Image ›`.
 *
 * The frame's own shape, and the reason it is a component rather than two
 * hand-written blocks: the duplicated list is the defect class that gets found
 * every time two pickers for the same kind of thing are written out twice.
 */
function PanelChoice<T extends string>({
  label,
  icon,
  value,
  options,
  labelOf,
  onChange,
  testId,
}: {
  label: string
  icon: ReactNode
  value: T
  options: readonly T[]
  labelOf: (option: T) => string
  onChange: (next: T) => void
  testId: string
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissableDetails(ref)
  return (
    <details ref={ref} className="relative" data-testid={testId} data-value={value}>
      <summary className="list-none flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[12px] cursor-pointer select-none hover:bg-muted/40">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {/* The VALUE, on the row, as the frame shows it — the row is the
              readout as well as the door to the choices. */}
          <span data-testid={`${testId}-value`}>{labelOf(value)}</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </summary>
      <div className="px-2 pb-1.5 pt-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            data-testid={`${testId}-${option}`}
            onClick={() => {
              onChange(option)
              if (ref.current) ref.current.open = false
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-muted/40',
              value === option && 'text-accent',
            )}
          >
            <Check className={cn('h-3.5 w-3.5 shrink-0', value === option ? 'opacity-100' : 'opacity-0')} aria-hidden />
            {labelOf(option)}
          </button>
        ))}
      </div>
    </details>
  )
}

/**
 * §V2-07 frame `11:30` — the toolbar's assignee control, as the frame draws
 * it: `⚇ Assignee` followed by the chosen person's FACE with an `✕` on it, and
 * a picker of faces behind the chip. Under the faces, the three switches the
 * same frame's popover carries — "Tasks where I have assigned": Comments ·
 * Subtasks · Checklists.
 *
 * WHY THE FACES AND THE THREE SWITCHES ARE ONE PANEL. The frame has two
 * popovers off the same cluster — one to choose the person, one for the three
 * switches — and they are settings of a single filter: with nobody chosen the
 * switches have nothing to extend, and they are meaningless anywhere else in
 * the product. One panel is one place to look; two would be a second door to
 * the same state, which is how the two ended up disagreeing everywhere else
 * this audit has looked.
 *
 * It owns NO state. `selected` and `onSelect` are the same
 * `columnFilters.assignees` the native select and the table's column funnel
 * write, and the three switches are the route's, because they go into the
 * saved view's config.
 */
function AssigneePicker({
  detailsRef,
  members,
  currentUserId,
  selected,
  onSelect,
  assignedViaOn,
  comments,
  onComments,
  subtasks,
  onSubtasks,
  checklists,
  onChecklists,
}: {
  detailsRef: React.RefObject<HTMLDetailsElement | null>
  members: WorkspaceMember[]
  currentUserId: string
  selected: string[]
  onSelect: (value: string) => void
  /** True when the filter names a real person — the only state the three switches change anything in. */
  assignedViaOn: boolean
  comments: boolean
  onComments: (next: boolean) => void
  subtasks: boolean
  onSubtasks: (next: boolean) => void
  checklists: boolean
  onChecklists: (next: boolean) => void
}) {
  const { t } = useTranslation()
  /*
   * ONE list, built once, in the frame's order: Anyone, then Me, then
   * Unassigned, then everybody else. It is the same order and the same
   * membership as the native `<select>` beside it — written here once and
   * mapped twice would have been the duplicated-list defect with two pickers
   * that quietly offer different people.
   */
  const options = useMemo(() => {
    const rows: { value: string; label: string; face: boolean }[] = [
      { value: '', label: t('list.assigneeAnyone'), face: false },
    ]
    if (currentUserId) rows.push({ value: currentUserId, label: t('list.assigneeMe'), face: true })
    rows.push({ value: UNASSIGNED_FILTER, label: t('list.group.unassigned'), face: false })
    for (const m of members) {
      if (m.userId === currentUserId) continue
      rows.push({ value: m.userId, label: m.displayName || m.email, face: true })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, currentUserId, t])

  const current = selected.length === 1 ? selected[0] : ''
  const chosen = current ? options.find((o) => o.value === current) ?? null : null

  return (
    <details ref={detailsRef} className="relative shrink-0" data-testid="list-assignee-picker" data-value={current}>
      <summary className="list-none h-8 px-2.5 flex items-center gap-1.5 rounded-md border border-border/80 bg-card text-[12px] cursor-pointer select-none hover:bg-muted/40">
        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {t('list.assigneeLabel')}
        {chosen && (
          <span
            className="ml-0.5 inline-flex items-center gap-1"
            data-testid="list-assignee-selected"
            data-user-id={chosen.value}
          >
            {chosen.face ? (
              <span data-testid="list-assignee-face" data-for={chosen.value}>
                <PersonAvatar name={chosen.label} size="xs" />
              </span>
            ) : (
              <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4">{chosen.label}</span>
            )}
            {/*
              The frame's `✕` badge on the face. Inside a <summary>, so both
              the default toggle AND the bubble have to be stopped: without
              `preventDefault` clearing the filter would also open the panel,
              which is a different thing happening than the one that was
              pressed.
            */}
            <button
              type="button"
              aria-label={t('list.assigneeClear')}
              title={t('list.assigneeClear')}
              data-testid="list-assignee-clear"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelect('')
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-border bg-card p-1 shadow-lg">
        <div className="max-h-56 overflow-y-auto" role="radiogroup" aria-label={t('list.assigneeLabel')}>
          {options.map((o) => (
            <button
              key={o.value || 'anyone'}
              type="button"
              role="radio"
              aria-checked={current === o.value}
              data-testid={`list-assignee-option-${o.value || 'anyone'}`}
              data-face={o.face ? 'true' : 'false'}
              onClick={() => {
                onSelect(o.value)
                if (detailsRef.current) detailsRef.current.open = false
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-muted/40',
                current === o.value && 'text-accent',
              )}
            >
              {o.face ? (
                /*
                 * Named, and the name is the point of the row: "an avatar
                 * picker" is a claim about what is DRAWN, and a picker that
                 * listed the same names in a panel instead of a dropdown
                 * would satisfy every other assertion in `list-assignee-filter`.
                 */
                <span data-testid="list-assignee-face" data-for={o.value}>
                  <PersonAvatar name={o.label} size="xs" />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
              )}
              <span className="truncate">{o.label}</span>
              <Check className={cn('ml-auto h-3.5 w-3.5 shrink-0', current === o.value ? 'opacity-100' : 'opacity-0')} aria-hidden />
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-border/40 pt-1" data-testid="list-assigned-via">
          <p className="px-2 pb-0.5 text-[11px] text-muted-foreground">{t('list.assignedVia.title')}</p>
          <PanelSwitch
            testId="list-assigned-via-comments"
            icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
            label={t('list.assignedVia.comments')}
            checked={comments}
            onChange={onComments}
          />
          <PanelSwitch
            testId="list-assigned-via-subtasks"
            icon={<GitBranch className="h-3.5 w-3.5" aria-hidden />}
            label={t('list.assignedVia.subtasks')}
            checked={subtasks}
            onChange={onSubtasks}
          />
          <PanelSwitch
            testId="list-assigned-via-checklists"
            icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />}
            label={t('list.assignedVia.checklists')}
            checked={checklists}
            onChange={onChecklists}
          />
          {/*
            Said out loud rather than left to be discovered: with "Anyone"
            chosen these three extend nothing, and three switches that visibly
            move while the grid does not is the exact shape of the dead
            control this audit keeps finding.
          */}
          {!assignedViaOn && (
            <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground" data-testid="list-assigned-via-hint">
              {t('list.assignedVia.hint')}
            </p>
          )}
        </div>
      </div>
    </details>
  )
}

type SavedViewRow = {
  id: string
  name: string
  isDefault?: boolean
  isPinned?: boolean
  visibility?: 'everyone' | 'private' | 'protected'
  autosave?: boolean
}

function CustomizeViewPanel({
  listId,
  includeClosed,
  includeArchived,
  exportView,
  requireBoardExport,
  boardExportLocked,
  boardExportPlan,
  view,
  onPatch,
  onAutosave,
  onCopyLink,
  onShare,
  cardSize,
  onCardSize,
  cardCover,
  onCardCover,
  isBoard,
  stackFields,
  onStackFields,
  showEmptyFields,
  onShowEmptyFields,
  collapseEmptyColumns,
  onCollapseEmptyColumns,
}: {
  listId: string
  /**
   * §V2-13 `[10:38]`–`[10:49]` — which shape the Download button asks for.
   * `'board'` is the paid artifact; `'list'` is the free one.
   */
  exportView: 'list' | 'board'
  /** Opens the paywall and returns false when the plan lacks the board export. */
  requireBoardExport: () => boolean
  /** Whether to say so up front, rather than only after the button is pressed. */
  boardExportLocked: boolean
  /*
   * What the list is CURRENTLY showing. The export is meant to be the view you
   * are looking at, so the two toggles that change which rows are on screen
   * have to reach the request — otherwise "export view" quietly means
   * "export something else".
   */
  includeClosed: boolean
  includeArchived: boolean
  /** The saved view this panel's switches act on, if the tab strip is on one. */
  view?: SavedViewRow
  onPatch: (patch: Record<string, unknown>) => void
  onAutosave: (next: boolean) => void
  onCopyLink: () => void
  onShare: () => void
  /**
   * §V2-S13 frame `10:35` — the two rows this panel LEADS with, above Stack
   * fields. They belong to the view rather than to this component, which is
   * why they arrive as props: `currentViewConfig` carries them, so the Save
   * chip notices a change and a saved view remembers it.
   */
  cardSize: CardSize
  onCardSize: (next: CardSize) => void
  cardCover: CardCover
  onCardCover: (next: CardCover) => void
  /**
   * §V2-07 frame `11:00` — the tier the caption under Download names, or null
   * when this download is not gated.
   *
   * Resolved by the caller out of `plan.catalog` — the SAME catalog
   * `feature-gate.tsx`'s `upgradeTarget` reads, which is not exported and
   * which this file may not edit. `list-customize.mjs`'s "the caption names
   * the same tier the dialog offers" check exists for exactly that: two
   * readers of one catalog is only safe while something fails when they
   * disagree.
   */
  boardExportPlan: { id: string; label: string } | null
  /**
   * §V2-S13 frame `10:35` vs frame `11:00` — whether the panel's middle block
   * is the BOARD's three switches. The same panel on the List view carries a
   * different trio, so these are drawn where the frame draws them rather than
   * everywhere the panel opens.
   */
  isBoard: boolean
  stackFields: boolean
  onStackFields: (next: boolean) => void
  showEmptyFields: boolean
  onShowEmptyFields: (next: boolean) => void
  collapseEmptyColumns: boolean
  onCollapseEmptyColumns: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const [columns, setColumns] = useState<'visible' | 'names' | 'all'>('visible')
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv')
  const [dateFormat, setDateFormat] = useState<'normal' | 'iso' | 'us' | 'eu'>('normal')
  const [timeFormat, setTimeFormat] = useState<'normal' | 'h24' | 'none'>('normal')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDetailsElement>(null)
  useDismissableDetails(ref)

  async function download() {
    /*
     * §V2-13 `[10:44]` "abhi [humare paas] nahi hai" — the board download is
     * the one that stops here. Checked BEFORE the request so a blocked person
     * gets the paywall rather than a failed download and a toast that does not
     * say why; the server refuses it too, which is the half that counts.
     */
    if (exportView === 'board' && !requireBoardExport()) {
      if (ref.current) ref.current.open = false
      return
    }
    setBusy(true)
    try {
      const query = new URLSearchParams({
        columns,
        format,
        dateFormat,
        timeFormat,
        includeClosed: String(includeClosed),
        includeArchived: String(includeArchived),
        view: exportView,
      })
      // `downloadFile` already carries the Authorization header, refreshes an
      // expired token and revokes the object URL — an <a href> can do none of
      // those, and a second copy of it here would be a second thing to fix.
      await downloadFile(
        `/tasks/list/${listId}/export?${query.toString()}`,
        `list.${format === 'xlsx' ? 'xlsx' : 'csv'}`,
      )
      if (ref.current) ref.current.open = false
    } catch {
      toast.error(t('list.export.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details ref={ref} className="relative" data-testid="list-customize">
      <summary className="list-none h-8 px-2.5 flex items-center gap-1.5 rounded-md border border-border/80 bg-card text-[12px] cursor-pointer select-none hover:bg-muted/40">
        <Settings2 className="h-3.5 w-3.5" aria-hidden />
        {t('list.customize')}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-border bg-card p-1 shadow-lg">
        {/*
          §V2-S13 frame `10:35` — the TOP of the panel, in the frame's order:
          `Card size   Medium ›` then `Card cover   Image ›`, above the rule
          that separates them from everything else. They are first in the
          frame and first here.

          Card size is a real density (see `CARD_SIZE_STYLE`) and Card cover is
          the switch for an image the LIST endpoint now carries — before this,
          a cover set through the shipped picker was visible on exactly the one
          surface that set it, so a control here would have configured
          something nothing could draw.
        */}
        <div className="border-b border-border/40 pb-1" data-testid="list-card-settings">
          <PanelChoice
            testId="list-card-size"
            icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />}
            label={t('list.card.size')}
            value={cardSize}
            options={CARD_SIZES}
            labelOf={(option) => t(CARD_SIZE_LABEL_KEYS[option])}
            onChange={onCardSize}
          />
          <PanelChoice
            testId="list-card-cover"
            icon={<ImageIcon className="h-3.5 w-3.5" aria-hidden />}
            label={t('list.card.cover')}
            value={cardCover}
            options={CARD_COVERS}
            labelOf={(option) => t(CARD_COVER_LABEL_KEYS[option])}
            onChange={onCardCover}
          />
        </div>
        {/*
          §V2-S13 frame `10:35` — the three switches the frame draws directly
          under Card cover, in the frame's order and at the frame's positions:
          Stack fields (off), Show empty fields (ON), Collapse empty columns
          (off).

          Each one reads somewhere. Stack fields and Show empty fields change
          how a BOARD CARD lays out its fields; Collapse empty columns changes
          which LANES are open. A switch here whose only effect was the value
          it stores would be the mirror defect this ledger's §1 is made of, so
          the suite that covers them measures the grid and never the toggle.
        */}
        {isBoard && (
          <div className="border-b border-border/40 pb-1" data-testid="list-board-settings">
            <PanelSwitch
              testId="list-board-stack-fields"
              icon={<AlignLeft className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.board.stackFields')}
              hint={t('list.board.stackFieldsHint')}
              checked={stackFields}
              onChange={onStackFields}
            />
            <PanelSwitch
              testId="list-board-show-empty-fields"
              icon={<SquareDashed className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.board.showEmptyFields')}
              hint={t('list.board.showEmptyFieldsHint')}
              checked={showEmptyFields}
              onChange={onShowEmptyFields}
            />
            <PanelSwitch
              testId="list-board-collapse-empty"
              icon={<FoldHorizontal className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.board.collapseEmptyColumns')}
              hint={t('list.board.collapseEmptyColumnsHint')}
              checked={collapseEmptyColumns}
              onChange={onCollapseEmptyColumns}
            />
          </div>
        )}
        {/*
          The half of the panel that belongs to the SAVED VIEW, in the order
          frames `10:36` and `11:14` list it: Autosave for me · Pin view ·
          Private view · Protect view · Set as default view · Copy link to view
          · Export view · Sharing & Permissions.

          When the tab strip is on a built-in type rather than a saved view
          there is nothing here to pin, protect or share, and the panel says
          that instead of showing seven switches that would silently do
          nothing. "Favorite" is absent: the frame shows it as a submenu with a
          chevron, and the video never opens it, so there is no behaviour to
          build against and a toggle would be a guess wearing a label.
        */}
        {view ? (
          <div className="border-b border-border/40 pb-1" data-testid="list-view-settings">
            <PanelSwitch
              testId="list-view-autosave"
              icon={<Save className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.autosave')}
              hint={t('list.view.autosaveHint')}
              checked={!!view.autosave}
              onChange={onAutosave}
            />
            <PanelSwitch
              testId="list-view-pin"
              icon={<Pin className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.pin')}
              checked={!!view.isPinned}
              onChange={(next) => onPatch({ isPinned: next })}
            />
            <PanelSwitch
              testId="list-view-private"
              icon={<Lock className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.private')}
              hint={t('list.view.privateHint')}
              checked={view.visibility === 'private'}
              onChange={(next) => onPatch({ visibility: next ? 'private' : 'everyone' })}
            />
            <PanelSwitch
              testId="list-view-protect"
              icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.protect')}
              hint={t('list.view.protectHint')}
              checked={view.visibility === 'protected'}
              onChange={(next) => onPatch({ visibility: next ? 'protected' : 'everyone' })}
            />
            <PanelSwitch
              testId="list-view-default"
              icon={<Home className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.setDefault')}
              checked={!!view.isDefault}
              // Un-defaulting would leave the list with no default at all, and
              // the way you change it is by making another view the default.
              disabled={!!view.isDefault}
              onChange={() => onPatch({ isDefault: true })}
            />
            <PanelAction
              testId="list-view-copy-link"
              icon={<Link2 className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.copyLink')}
              onClick={onCopyLink}
            />
            <PanelAction
              testId="list-view-share"
              icon={<Share2 className="h-3.5 w-3.5" aria-hidden />}
              label={t('list.view.sharing')}
              onClick={onShare}
            />
          </div>
        ) : (
          <p className="border-b border-border/40 px-2 pb-2 pt-1 text-[11px] text-muted-foreground" data-testid="list-view-settings-empty">
            {t('list.view.saveFirst')}
          </p>
        )}

        {/*
          `data-export-view` is what tells a check which artifact this panel is
          about to ask for. A board download and a list download are the same
          five controls and the same button, so nothing on screen distinguishes
          them — and "the gate did not spread to the list export" is a claim
          about exactly that distinction.
        */}
        <details
          data-testid="list-export-section"
          data-export-view={exportView}
          data-export-locked={exportView === 'board' && boardExportLocked ? 'true' : 'false'}
        >
          <summary className="list-none flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[12px] cursor-pointer select-none hover:bg-muted/40">
            <span className="flex items-center gap-2">
              {exportView === 'board' && boardExportLocked ? (
                <Lock className="h-3.5 w-3.5 text-violet-500" aria-hidden data-testid="list-export-lock" />
              ) : (
                <Download className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              )}
              {t('list.export.title')}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </summary>

          <div className="px-2 pb-2 pt-1">
            <div className="mb-1.5 text-[11px] text-muted-foreground">{t('list.export.fileFormat')}</div>
            <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-md border border-border/70 p-0.5">
              {(['csv', 'xlsx'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  data-testid={`list-export-format-${f}`}
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    'rounded px-2 py-1 text-[12px] transition-colors',
                    format === f ? 'bg-accent/15 font-medium text-accent' : 'hover:bg-muted/50',
                  )}
                >
                  {t(f === 'csv' ? 'list.export.formatCsv' : 'list.export.formatExcel')}
                </button>
              ))}
            </div>

            <div className="mb-1.5 text-[11px] text-muted-foreground">{t('list.export.whatToExport')}</div>
            <div className="space-y-1">
              {(['visible', 'names', 'all'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input
                    type="radio"
                    name="export-columns"
                    checked={columns === mode}
                    onChange={() => setColumns(mode)}
                    data-testid={`list-export-${mode}`}
                  />
                  {t(`list.export.columns.${mode}` as never)}
                </label>
              ))}
            </div>

            <label className="mt-2.5 block text-[11px] text-muted-foreground" htmlFor="list-export-date">
              {t('list.export.dateFormat')}
            </label>
            <select
              id="list-export-date"
              data-testid="list-export-date-format"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[12px]"
            >
              {(['normal', 'iso', 'us', 'eu'] as const).map((k) => (
                <option key={k} value={k}>{t(`list.export.date.${k}` as never)}</option>
              ))}
            </select>

            <label className="mt-2 block text-[11px] text-muted-foreground" htmlFor="list-export-time">
              {t('list.export.timeFormat')}
            </label>
            <select
              id="list-export-time"
              data-testid="list-export-time-format"
              value={timeFormat}
              onChange={(e) => setTimeFormat(e.target.value as typeof timeFormat)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[12px]"
            >
              {(['normal', 'h24', 'none'] as const).map((k) => (
                <option key={k} value={k}>{t(`list.export.time.${k}` as never)}</option>
              ))}
            </select>

            {/*
              Said once, quietly, because it is the thing that makes a date
              column reproducible: the server renders in UTC rather than in
              whatever timezone it happens to run in.
            */}
            <p className="mt-2 text-[11px] text-muted-foreground">{t('list.export.utcNote')}</p>

            <Button
              size="sm"
              variant="gradient"
              className="mt-2 w-full"
              disabled={busy}
              onClick={download}
              data-testid="list-export-download"
            >
              <Download className="h-3.5 w-3.5" /> {t('list.export.download')}
            </Button>

            {/*
              §V2-07 frame `11:00` — "⚡ Business feature", set in small grey
              type directly under the Download button.

              THIS IS THE HALF OF THE EXPORT-PAYWALL ROW THAT WAS STILL OPEN.
              The refusal has been built since `paywall-sites.mjs`: the server
              403s `view=board` on a Free plan and the panel marks the section
              locked. But the only thing that said so BEFORE the press was a
              padlock on the section's own `<summary>` — and the summary is
              scrolled away the moment the section is expanded, which is where
              the person is standing when they choose a format, a scope and a
              date style and then press a button that cannot work. The frame
              puts the plan's name at the bottom of the open dialog, next to
              the button, which is the one place it is read.

              It is gated on exactly the same condition as the refusal, and
              `[10:49]` is the reason that matters: "agar aap ke paas premium
              nahi to aap LIST VIEW download karo". A caption on the free list
              export would be this row's version of the gate spreading.
            */}
            {exportView === 'board' && boardExportLocked && (
              <p
                data-testid="list-export-plan-note"
                data-plan={boardExportPlan?.id ?? ''}
                className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground"
              >
                <Zap className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                {boardExportPlan
                  ? t('list.export.planNote', { plan: boardExportPlan.label })
                  : t('list.export.planNoteUnknown')}
              </p>
            )}
          </div>
        </details>
      </div>
    </details>
  )
}
