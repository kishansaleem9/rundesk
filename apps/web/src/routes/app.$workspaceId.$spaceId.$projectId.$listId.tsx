import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router'
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
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { toDateInput, withDatePart } from '../lib/task-dates'
import { criticalPath } from '../lib/gantt'
import { TaskDetailSheet } from '../components/task-detail-sheet'
import { ListStatusesManager } from '../components/list-statuses-manager'
import { ListEmailAliasPanel } from '../components/list-email-alias-panel'
import { SharePanel } from '../components/share-panel'
import { getRealtimeSocket } from '../lib/realtime'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { ListSkeleton } from '../components/loading-skeletons'

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
}

type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url'

// Offered when creating a field from the picker. Deliberately the same set this
// view knows how to render — the API accepts more (money, rating, email, phone),
// but creating one here that the List could not draw would be a trap.
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
  type: CustomFieldType
  options?: Array<{ label: string; value: string }> | null
}
type CustomFieldValue = {
  definition: { id: string }
  value: string | number | boolean | null
}

export const Route = createFileRoute('/app/$workspaceId/$spaceId/$projectId/$listId')({
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

const AGE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]
// Localized "how long ago" for the Created column, replacing date-fns'
// English-only formatDistanceToNowStrict. numeric:'auto' yields idiomatic
// forms like "yesterday" / "ayer" / "أمس".
function formatAge(iso: string, locale: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, secs] of AGE_UNITS) {
    if (abs >= secs) return rtf.format(-Math.round(diffSec / secs), unit)
  }
  return rtf.format(-diffSec, 'second')
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
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    listId: input.listId,
    title: input.title,
    priority: input.priority ?? 'normal',
  }
  if (input.status) body.status = input.status
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
const UNASSIGNED_FILTER = '__unassigned__'

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

function defaultSortDir(field: SortField): SortDir {
  // "Newest first" for created; everything else reads best ascending
  // (A→Z, urgent→low, soonest due first, first status first).
  return field === 'created' ? 'desc' : 'asc'
}

function columnFiltersActive(f: ColumnFilters): boolean {
  return f.statuses.length > 0 || f.priorities.length > 0 || f.assignees.length > 0
}

// ---------------------------------------------------------------------------
// Filter builder (A1.4). The column menus above only reach status / priority /
// assignee, which are the three attributes that happen to have a column. These
// rules cover everything else the row already carries — dates, creator,
// recurrence — plus the project's custom fields, so "show me everything Sara
// filed that is due this week" stops needing a report.
// ---------------------------------------------------------------------------
type FilterOp = 'is' | 'isNot' | 'before' | 'after' | 'between' | 'contains' | 'gt' | 'lt' | 'isSet' | 'isNotSet'
type FilterFieldKind = 'date' | 'user' | 'flag' | 'text' | 'number' | 'choice'
type FilterRule = { id: string; field: string; op: FilterOp; value: string; value2?: string }

const OPS_BY_KIND: Record<FilterFieldKind, FilterOp[]> = {
  date: ['before', 'after', 'between', 'isSet', 'isNotSet'],
  user: ['is', 'isNot'],
  flag: ['isSet', 'isNotSet'],
  text: ['contains', 'isSet', 'isNotSet'],
  number: ['gt', 'lt', 'isSet', 'isNotSet'],
  choice: ['is', 'isNot', 'isSet', 'isNotSet'],
}
/** Operators that ask only about presence, so the value input is hidden. */
const VALUELESS_OPS: FilterOp[] = ['isSet', 'isNotSet']

const BUILTIN_FILTER_FIELDS: Array<{ id: string; kind: FilterFieldKind; labelKey: TranslationKey }> = [
  { id: 'due', kind: 'date', labelKey: 'taskDetail.fieldDueDate' },
  { id: 'start', kind: 'date', labelKey: 'list.filter.fieldStart' },
  { id: 'created', kind: 'date', labelKey: 'list.sortCreated' },
  { id: 'creator', kind: 'user', labelKey: 'list.filter.fieldCreator' },
  { id: 'recurring', kind: 'flag', labelKey: 'list.filter.fieldRecurring' },
]

/** Custom-field type → the operator set that makes sense for it. */
const CUSTOM_FIELD_KIND: Record<CustomFieldType, FilterFieldKind> = {
  text: 'text',
  url: 'text',
  number: 'number',
  date: 'date',
  checkbox: 'choice',
  dropdown: 'choice',
}

/** Everything the rule evaluator needs beyond the task row itself. */
type FilterContext = {
  customFields: CustomFieldDef[]
  /** taskId → fieldId → value. Empty until a custom rule (or Table) loads it. */
  customValues: Record<string, Record<string, unknown>>
}

function filterFieldKind(field: string, customFields: CustomFieldDef[]): FilterFieldKind | null {
  const builtin = BUILTIN_FILTER_FIELDS.find((f) => f.id === field)
  if (builtin) return builtin.kind
  if (!field.startsWith('custom:')) return null
  const def = customFields.find((f) => f.id === field.slice('custom:'.length))
  return def ? CUSTOM_FIELD_KIND[def.type] : null
}

/** Local calendar day of an ISO timestamp, so date rules compare like the
 *  Calendar view groups — lexical order on `yyyy-MM-dd` is chronological. */
function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd')
}

/** The raw value a rule's field holds on one task, or null when unset. */
function ruleFieldValue(task: TaskItem, field: string, ctx: FilterContext): unknown {
  switch (field) {
    case 'due': return task.dueDate ?? null
    case 'start': return task.startDate ?? null
    case 'created': return task.createdAt ?? null
    case 'creator': return task.createdById ?? null
    case 'recurring': return task.recurrence ?? null
    default: {
      if (!field.startsWith('custom:')) return null
      const raw = ctx.customValues[task.id]?.[field.slice('custom:'.length)]
      // A false checkbox is a real answer, not an empty one.
      return raw === undefined || raw === '' ? null : raw
    }
  }
}

function matchesRule(task: TaskItem, rule: FilterRule, ctx: FilterContext): boolean {
  const kind = filterFieldKind(rule.field, ctx.customFields)
  if (!kind) return true // the field was deleted underneath the view — don't hide rows
  const value = ruleFieldValue(task, rule.field, ctx)
  if (rule.op === 'isSet') return value !== null && value !== false
  if (rule.op === 'isNotSet') return value === null || value === false
  if (value === null) return false
  if (!rule.value.trim()) return true // half-built rule filters nothing

  if (kind === 'date') {
    const key = dayKey(String(value))
    if (!key) return false
    if (rule.op === 'before') return key < rule.value
    if (rule.op === 'after') return key > rule.value
    if (rule.op === 'between') return key >= rule.value && key <= (rule.value2 || rule.value)
    return true
  }
  if (kind === 'number') {
    const num = Number(value)
    const target = Number(rule.value)
    if (Number.isNaN(num) || Number.isNaN(target)) return false
    return rule.op === 'gt' ? num > target : num < target
  }
  const text = String(value).toLowerCase()
  if (rule.op === 'contains') return text.includes(rule.value.trim().toLowerCase())
  if (rule.op === 'is') return text === rule.value.toLowerCase()
  if (rule.op === 'isNot') return text !== rule.value.toLowerCase()
  return true
}

function filterTasks(
  tasks: TaskItem[],
  statusFilter: 'all' | TaskStatus,
  filters: ColumnFilters,
  search = '',
  rules: FilterRule[] = [],
  ctx: FilterContext = { customFields: [], customValues: {} },
): TaskItem[] {
  const needle = search.trim().toLowerCase()
  if (statusFilter === 'all' && !columnFiltersActive(filters) && !needle && rules.length === 0) return tasks
  return tasks.filter((task) => {
    if (needle && !task.title.toLowerCase().includes(needle)) return false
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(task.status)) return false
    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
    if (rules.some((rule) => !matchesRule(task, rule, ctx))) return false
    if (filters.assignees.length > 0) {
      const ids = (task.assignees ?? []).map((a) => a.userId)
      const matchesUnassigned = filters.assignees.includes(UNASSIGNED_FILTER) && ids.length === 0
      const matchesSomeone = ids.some((id) => filters.assignees.includes(id))
      if (!matchesUnassigned && !matchesSomeone) return false
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
const BOARD_CARD_ESTIMATE_PX = 76
const TABLE_VIRTUALIZE_THRESHOLD = 120
const TABLE_ROW_ESTIMATE_PX = 36

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
 * A1.4 — the filter builder: stacked field/operator/value rows, ANDed together
 * and saved with the view like every other toolbar control. It sits beside the
 * column funnels rather than replacing them; those stay the one-click path for
 * the three attributes that have a column.
 */
function FilterBuilderMenu({
  rules,
  onChange,
  customFields,
  workspaceMembers,
}: {
  rules: FilterRule[]
  onChange: (next: FilterRule[]) => void
  customFields: CustomFieldDef[]
  workspaceMembers: WorkspaceMember[]
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

  const fieldOptions = [
    ...BUILTIN_FILTER_FIELDS.map((f) => ({ value: f.id, label: t(f.labelKey) })),
    ...customFields.map((f) => ({ value: `custom:${f.id}`, label: f.name })),
  ]

  const patch = (id: string, next: Partial<FilterRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...next } : r)))

  const addRule = () => {
    const field = fieldOptions[0]?.value ?? 'due'
    const kind = filterFieldKind(field, customFields) ?? 'date'
    onChange([
      ...rules,
      { id: `${Date.now()}-${rules.length}`, field, op: OPS_BY_KIND[kind][0], value: '' },
    ])
  }

  // Changing the field can invalidate the operator (a date "before" makes no
  // sense on a creator), so re-seed both operator and value from the new kind.
  const changeField = (rule: FilterRule, field: string) => {
    const kind = filterFieldKind(field, customFields) ?? 'text'
    patch(rule.id, { field, op: OPS_BY_KIND[kind][0], value: '', value2: undefined })
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
            onChange={(e) => patch(rule.id, { value: e.target.value })}
            aria-label={t('list.filter.value')}
            className={cls}
          />
          {rule.op === 'between' && (
            <input
              type="date"
              value={rule.value2 ?? ''}
              onChange={(e) => patch(rule.id, { value2: e.target.value })}
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
          onChange={(e) => patch(rule.id, { value: e.target.value })}
          aria-label={t('list.filter.value')}
          className={cls}
        >
          <option value="">{t('list.filter.pickValue')}</option>
          {workspaceMembers.map((m) => (
            <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
          ))}
        </select>
      )
    }
    if (kind === 'choice') {
      const def = customFields.find((f) => `custom:${f.id}` === rule.field)
      const options =
        def?.type === 'checkbox'
          ? [
              { value: 'true', label: t('list.filter.checked') },
              { value: 'false', label: t('list.filter.unchecked') },
            ]
          : (def?.options ?? []).map((o) => ({ value: o.value, label: o.label }))
      return (
        <select
          value={rule.value}
          onChange={(e) => patch(rule.id, { value: e.target.value })}
          aria-label={t('list.filter.value')}
          className={cls}
        >
          <option value="">{t('list.filter.pickValue')}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type={kind === 'number' ? 'number' : 'text'}
        value={rule.value}
        onChange={(e) => patch(rule.id, { value: e.target.value })}
        placeholder={t('list.filter.value')}
        aria-label={t('list.filter.value')}
        className={cls}
      />
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'h-8 shrink-0 rounded-md border border-border/80 bg-card px-2.5 text-[12px] inline-flex items-center gap-1.5 hover:bg-muted/40',
          rules.length > 0 && 'text-violet-600 dark:text-violet-400',
        )}
        title={t('list.filter.builder')}
      >
        <Filter className={cn('h-3.5 w-3.5', rules.length > 0 && 'fill-current')} />
        {rules.length > 0 ? t('list.filter.builderCount', { count: rules.length }) : t('list.filter.builder')}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-[26rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-card p-2 shadow-lg space-y-1.5">
          {rules.length === 0 && (
            <p className="px-1 py-1 text-[12px] text-muted-foreground">{t('list.filter.builderEmpty')}</p>
          )}
          {rules.map((rule, idx) => {
            const kind = filterFieldKind(rule.field, customFields) ?? 'text'
            return (
              <div key={rule.id} className="flex items-center gap-1">
                <span className="w-8 shrink-0 text-[11px] uppercase text-muted-foreground">
                  {idx === 0 ? t('list.filter.where') : t('list.filter.and')}
                </span>
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
                  onChange={(e) => patch(rule.id, { op: e.target.value as FilterOp })}
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
                  onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
                  aria-label={t('list.filter.removeRule')}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={addRule}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('list.filter.addRule')}
            </button>
            {rules.length > 0 && (
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
}: {
  sort: SortState
  onSort: (field: SortField) => void
  columnFilters: ColumnFilters
  onColumnFilters: (updater: (prev: ColumnFilters) => ColumnFilters) => void
  groupBy: 'status' | 'priority' | 'assignee'
  workspaceMembers: WorkspaceMember[]
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
      <div className={cn('items-center gap-1 w-24 shrink-0', groupBy === 'priority' ? 'hidden' : 'flex')}>
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
  const [activeView, setActiveView] = useState<'list' | 'board' | 'calendar' | 'table' | 'gantt'>('list')
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
  const ALL_VIEWS = ['list', 'board', 'table', 'calendar', 'gantt'] as const
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
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'assignee'>('status')
  // Custom-field column visibility, persisted per saved view (Plan §4/§5).
  const boardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [hiddenFields, setHiddenFields] = useState<Set<string>>(() => new Set())
  const [fieldSearch, setFieldSearch] = useState('')
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomFieldDef['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')
  // The Table "Fields" popover is a native <details>; native <details> doesn't
  // close on an outside click, so wire one up to match the other toolbar popovers.
  const fieldsDetailsRef = useRef<HTMLDetailsElement | null>(null)
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const d = fieldsDetailsRef.current
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])
  // Board: collapsed columns (ephemeral) + per-status WIP limits (persisted).
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => new Set())
  const [wipLimits, setWipLimits] = useState<Record<string, number>>({})
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [statusManagerOpen, setStatusManagerOpen] = useState(false)
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
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
  const locationSearch = useRouterState({ select: (s) => (s.location as any).searchStr as string })

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['tasks', listId],
    queryFn: () => api<TaskItem[]>(`/tasks/list/${listId}`),
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
    queryFn: () => api<Array<{ id: string; name: string; type: 'list' | 'board' | 'calendar' | 'gantt' | 'table'; isDefault?: boolean; config?: any }>>(`/lists/${listId}/views`),
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
    (activeView === 'table' || filterRules.some((r) => r.field.startsWith('custom:')))
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

  const visibleTasks = useMemo(() => {
    const filtered = filterTasks(tasks, statusFilter, columnFilters, taskSearch, filterRules, {
      customFields: projectFields,
      customValues: customFieldByTask,
    })
    // Custom-field sort is resolved inside TableView (it owns the values); for
    // every other view a custom sort is a stable no-op here.
    return sortTasks(filtered, sort, statusOrder)
  }, [tasks, statusFilter, columnFilters, taskSearch, filterRules, projectFields, customFieldByTask, sort, statusOrder])

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

  useEffect(() => {
    const nextTaskId = new URLSearchParams(locationSearch ?? '').get('task')
    if (nextTaskId) setSelectedTaskId(nextTaskId)
  }, [locationSearch])

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
    setFilterRules(Array.isArray(cfg.filterRules) ? (cfg.filterRules as FilterRule[]) : [])
    setGroupBy((cfg.groupBy as 'status' | 'priority' | 'assignee') ?? 'status')
    setHiddenFields(new Set(Array.isArray(cfg.hiddenFields) ? (cfg.hiddenFields as string[]) : []))
    setWipLimits(cfg.wipLimits && typeof cfg.wipLimits === 'object' ? (cfg.wipLimits as Record<string, number>) : {})
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
    wipLimits,
  })

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
    toast.success(t('list.viewUpdated'))
  }

  const makeSavedViewDefault = async (viewId: string) => {
    await api(`/views/${viewId}`, { method: 'PATCH', body: { isDefault: true } })
    await refreshSavedViews()
  }

  const deleteSavedView = async (viewId: string) => {
    await api(`/views/${viewId}`, { method: 'DELETE' })
    if (selectedSavedViewId === viewId) setSelectedSavedViewId('')
    await refreshSavedViews()
  }

  useEffect(() => {
    if (appliedInitialView || savedViews.length === 0) return
    const defaultView = savedViews.find((v) => v.isDefault) ?? savedViews[0]
    if (defaultView) applyView(defaultView.id)
    setAppliedInitialView(true)
  }, [appliedInitialView, savedViews])

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
        const order: Array<typeof activeView> = (
          ['list', 'board', 'table', 'calendar', 'gantt'] as Array<typeof activeView>
        ).filter((v) => enabledViewsRef.current.includes(v))
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
      ] as { id: typeof activeView; label: string }[]
    )
      .filter((tb) => enabledViews.includes(tb.id))
      .map((tb) => ({
        key: `type:${tb.id}`,
        label: tb.label,
        active: !selectedSavedViewId && activeView === tb.id,
        onSelect: () => {
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
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0f1114]">
      <TaskListChrome
        listName={listMeta?.name ?? t('list.defaultListName')}
        taskCount={visibleTasks.length}
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder={t('list.searchTasks')}
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
              rules={filterRules}
              onChange={setFilterRules}
              customFields={projectFields}
              workspaceMembers={workspaceMembers}
            />
            <WorkFilterSelect
              value={sort.field.startsWith('custom:') ? 'created' : sort.field}
              onChange={(v) => setSort((s) => ({ field: v as SortField, dir: s.field === v ? s.dir : defaultSortDir(v as SortField) }))}
            >
              <option value="created">{t('list.sortCreated')}</option>
              <option value="due">{t('list.sortDueDate')}</option>
              <option value="priority">{t('list.sortPriority')}</option>
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
            <WorkFilterSelect value={groupBy} onChange={(v) => setGroupBy(v as typeof groupBy)}>
              <option value="status">{t('list.groupByStatus')}</option>
              <option value="priority">{t('list.groupByPriority')}</option>
              <option value="assignee">{t('list.groupByAssignee')}</option>
            </WorkFilterSelect>
            {(activeView === 'table' || activeView === 'list') && (
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
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              onClick={() => setEmailAliasOpen(true)}
              title={t('list.emailAliasTitle')}
            >
              {t('list.emailButton')}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          // §2.9a — rows, not the words "Loading tasks…" in a box.
          <ListSkeleton rows={8} rowClassName="h-10" />
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-[#fbfbfc]/60 dark:bg-[#16181d]/40 p-12 text-center">
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
          />
          <GroupedListView
            tasks={visibleTasks}
            groupBy={groupBy}
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
                  tasks={tasksByStatus[s.key] ?? []}
                  onOpenTask={(taskId) => setSelectedTaskId(taskId)}
                  collapsed={collapsedColumns.has(s.key)}
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
        ) : (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCalendarMonth((d) => (calendarView === 'week' ? addDays(d, -7) : addMonths(d, -1)))
                }
              >
                {t('list.calendar.prev')}
              </Button>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">
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
      <TaskDetailSheet taskId={selectedTaskId} open={Boolean(selectedTaskId)} onOpenChange={(next) => !next && setSelectedTaskId(null)} workspaceId={workspaceId} />
      <ListStatusesManager listId={listId} open={statusManagerOpen} onOpenChange={setStatusManagerOpen} />
      <ListEmailAliasPanel listId={listId} open={emailAliasOpen} onOpenChange={setEmailAliasOpen} />
      <SharePanel
        open={sharePanelOpen}
        onOpenChange={setSharePanelOpen}
        objectType="list"
        objectId={listId}
        objectName={listMeta?.name}
      />
    </div>
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
  onAddTask,
}: {
  tasks: TaskItem[]
  groupBy: 'status' | 'priority' | 'assignee'
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
  onAddTask: (
    status: TaskStatus,
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const ordered = useOrderedStatuses()
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
                  />
                ))
              )}
            </div>
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
                    />
                  ))
                )}
                {groupTasks.length === 0 && <div className="text-xs text-muted-foreground">{t('list.noTasks')}</div>}
              </div>
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
          <section key={status} className="rounded-lg border border-border bg-card overflow-hidden">
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
                    />
                  ))
                )}
                <InlineAddTask status={status} onAdd={(title, opts) => onAddTask(status, title, opts)} />
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
}: {
  virtualKey: string
  tasks: TaskItem[]
  selectedTaskIds: Set<string>
  onToggleSelect: (taskId: string, additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
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
}: {
  task: TaskItem
  selected: boolean
  onToggleSelect: (additive: boolean) => void
  onOpenTask: (taskId: string) => void
  onToggleDone: (task: TaskItem) => Promise<void> | void
  onPatchTask?: (taskId: string, patch: TaskPatch) => Promise<void> | void
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
  const hasSubtasks = subtasks.length > 0
  const subtasksDone = subtasks.filter((s) => s.statusCategory === 'closed' || s.status === 'done').length
  const [expanded, setExpanded] = useState(false)
  // Inline edits (Plan §5): cycle priority on click; edit due date in place.
  const cyclePriority = () => {
    const order: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
    const next = order[(order.indexOf(task.priority) + 1) % order.length]
    void onPatchTask?.(task.id, { priority: next })
  }

  return (
    <div>
    <div
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

      {onPatchTask ? (
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
      )}

      {/* Coarse on purpose — this is a nudge from a row, not the place you set
          a deadline. It may change the day; it may not quietly drop a time the
          row is carrying, which sending a bare YYYY-MM-DD did. */}
      {onPatchTask ? (
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
      )}

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

function InlineAddTask({
  status,
  onAdd,
}: {
  status: TaskStatus
  onAdd: (
    title: string,
    opts?: { priority?: TaskPriority; dueDate?: string; startDate?: string },
  ) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const meta = useStatusMeta(status)
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [active, setActive] = useState(false)
  // Guards the field-level onBlur from collapsing the composer while focus is
  // simply moving between the title/priority/date controls in the same row.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setValue('')
    setPriority('normal')
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
        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        onClick={() => setActive(true)}
      >
        <Plus className="h-4 w-4" />
        {t('list.addTask')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
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
        placeholder={t('list.newStatusTaskPlaceholder', { status: meta.label.toLowerCase() })}
        className="h-7 flex-1 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
      />
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
  const columns: TableCol[] = [
    { key: 'checkbox', label: '', width: 'w-9' },
    { key: 'title', label: t('list.table.colTitle'), width: 'flex-1 min-w-[240px]', sortField: 'title' },
    { key: 'status', label: t('taskDetail.fieldStatus'), width: 'w-36', sortField: 'status', filterKind: 'status' },
    { key: 'priority', label: t('taskDetail.fieldPriority'), width: 'w-28', sortField: 'priority', filterKind: 'priority' },
    { key: 'assignees', label: t('taskDetail.fieldAssignees'), width: 'w-28', sortField: 'assignee', filterKind: 'assignee' },
    { key: 'due', label: t('taskDetail.fieldDueDate'), width: 'w-28', sortField: 'due' },
    { key: 'created', label: t('list.table.colCreated'), width: 'w-24', sortField: 'created' },
  ]
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
          <div className="sticky top-0 z-10 flex items-center bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {columns.map((col) => (
              <div
                key={col.key}
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
                        {task.isMilestone && <Diamond className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                        <TaskTypeMark type={task.taskType} />
                        {task.title}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-36 px-3 flex items-center relative">
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

                  {/* Priority */}
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

                  {/* Assignees */}
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

                  {/* Due date */}
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

                  {/* Created */}
                  <div className="w-24 px-3 flex items-center text-xs text-muted-foreground tabular-nums">
                    {task.createdAt ? formatAge(task.createdAt, locale) : '—'}
                  </div>

                  {customColumns.map((field) => {
                    const open = customOpen?.taskId === task.id && customOpen.fieldId === field.id
                    const current = taskCustom[field.id]
                    const valueLabel =
                      current === null || current === undefined || current === ''
                        ? '—'
                        : String(current)

                    return (
                      <div key={field.id} className="w-36 px-3 flex items-center relative">
                        {open ? (
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
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (field.type === 'number') {
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
          <button
            type="button"
            onClick={() => setEditingWip(true)}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            title={t('list.board.setWipTitle')}
          >
            {wipLimit != null ? t('list.board.wipEdit') : t('list.board.setWip')}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="p-2 space-y-2 flex-1">
            {tasks.length >= BOARD_VIRTUALIZE_THRESHOLD ? (
              <VirtualizedBoardCards tasks={tasks} onOpenTask={onOpenTask} />
            ) : (
              tasks.map((task) => (
                <BoardTaskCard key={task.id} task={task} onOpenTask={onOpenTask} />
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
}: {
  task: TaskItem
  onOpenTask: (taskId: string) => void
}) {
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

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={`w-full text-left rounded border border-border bg-card p-2 hover:bg-muted ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => onOpenTask(task.id)}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        {task.isMilestone
          ? <Diamond className="h-3 w-3 mt-0.5 shrink-0 fill-amber-400 text-amber-500" />
          : <Flag className={cn('h-3 w-3 mt-0.5 shrink-0', PRIORITY_COLORS[task.priority])} />}
        <div className="font-medium text-sm leading-snug">{task.title}</div>
      </div>
      {(task.labels?.length ?? 0) > 0 && (
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
      {(due || subtasks.length > 0 || (task.openBlockerCount ?? 0) > 0 || assignees.length > 0) && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
          {due && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'text-red-500 font-medium')}>
              <CalendarIcon className="h-3 w-3" />
              {shortDate(due, locale)}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1" title={t('list.board.subtasksDoneTitle')}>
              ☑ {subtasksDone}/{subtasks.length}
            </span>
          )}
          {(task.openBlockerCount ?? 0) > 0 && (
            <span className="text-amber-700 dark:text-amber-300">{t('list.blockedBy', { count: task.openBlockerCount ?? 0 })}</span>
          )}
          {assignees.length > 0 && (
            <span className="ml-auto flex -space-x-1.5">
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
          )}
        </div>
      )}
    </button>
  )
}

function VirtualizedBoardCards({
  tasks,
  onOpenTask,
}: {
  tasks: TaskItem[]
  onOpenTask: (taskId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const cardVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => BOARD_CARD_ESTIMATE_PX,
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
              <BoardTaskCard task={task} onOpenTask={onOpenTask} />
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
