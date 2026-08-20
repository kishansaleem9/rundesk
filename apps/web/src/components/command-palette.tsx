import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
  cn,
} from '@rundesk/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Folder,
  GanttChart,
  Inbox,
  LayoutDashboard,
  Link as LinkIcon,
  List as ListIcon,
  MessageCircleReply,
  MessageSquare,
  Paperclip,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type SearchHit = { id: string; entityType: string; title: string; content: string; url: string }

function getWorkspaceIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'app') return null
  return parts[1] ?? null
}

const ENTITY_ICON: Record<string, React.ElementType> = {
  task: CheckCircle2,
  doc: FileText,
  file: Paperclip,
  project: Folder,
  list: ListIcon,
  channel: MessageSquare,
  message: MessageSquare,
  comment: MessageSquare,
  user: Users,
}
const ENTITY_ORDER = ['task', 'doc', 'file', 'comment', 'channel', 'message', 'user'] as const
/** The entity types the search API accepts in its `types` filter. */
type SearchEntityType = (typeof ENTITY_ORDER)[number]
const ENTITY_LABEL_KEY: Record<string, TranslationKey> = {
  task: 'palette.entityTasks',
  doc: 'palette.entityDocs',
  file: 'palette.entityFiles',
  comment: 'palette.entityComments',
  channel: 'palette.entityChannels',
  message: 'palette.entityMessages',
  user: 'palette.entityPeople',
}
const PRIORITY_LABEL_KEY: Record<string, TranslationKey> = {
  urgent: 'palette.priorityUrgent',
  high: 'palette.priorityHigh',
  normal: 'palette.priorityNormal',
  low: 'palette.priorityLow',
}

export function CommandPalette({
  open: openProp,
  onOpenChange,
  initialQuery = '',
  onAskAi,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialQuery?: string
  /** §A2.3 / §A6.4 — hands the typed query to the docked assistant. Omitted
   * outside a workspace, where there is nothing to ground an answer on. */
  onAskAi?: (question: string) => void
} = {}) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }
  const [query, setQuery] = useState(initialQuery)
  // "main sort bhi kar sakti hoon: last update, last created" — relevance stays
  // the default because it is what a text query is for.
  const [sortBy, setSortBy] = useState<'relevance' | 'updated' | 'created'>('relevance')
  const [typeFilter, setTypeFilter] = useState<Set<SearchEntityType>>(() => new Set())
  const typeParam = [...typeFilter].join(',')
  const toggleType = (v: SearchEntityType) =>
    setTypeFilter((cur) => {
      const next = new Set(cur)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  const [statusFilter, setStatusFilter] = useState<'' | 'open' | 'in_progress' | 'closed'>('')
  const [priorityFilter, setPriorityFilter] = useState<'' | 'urgent' | 'high' | 'normal' | 'low'>('')
  const [labelFilter, setLabelFilter] = useState<string>('')
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [creatorFilter, setCreatorFilter] = useState<string>('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [dueAfter, setDueAfter] = useState<string>('')
  const [dueBefore, setDueBefore] = useState<string>('')
  const [customFieldId, setCustomFieldId] = useState<string>('')
  const [customFieldValue, setCustomFieldValue] = useState<string>('')
  // §A2.4 — the strip used to sit open above every result; in a modal that is
  // most of the vertical space, spent on controls nobody is using yet.
  const [filtersOpen, setFiltersOpen] = useState(false)
  // §A2.1 — Tab on the highlighted row opens its extra actions.
  const [actionsForId, setActionsForId] = useState<string | null>(null)

  // When the palette is opened with a query forwarded from the header search
  // input, seed the command query so results show immediately.
  useEffect(() => {
    if (open && initialQuery) setQuery(initialQuery)
  }, [open, initialQuery])
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const workspaceId = useMemo(
    () => getWorkspaceIdFromPath(location.pathname),
    [location.pathname],
  )

  const labelsQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['labels', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string; color: string }>>(`/workspaces/${workspaceId}/labels`),
  })
  // §1.1 — "Task types is also a filter row in search." Same shape as labels.
  const taskTypesQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['task-types', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; name: string }>>(`/workspaces/${workspaceId}/task-types`),
  })

  type CustomFieldDef = {
    id: string
    name: string
    type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
    options: Array<{ label: string; value: string; color?: string }> | null
    projectName: string
  }
  const customFieldsQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['search-custom-fields', workspaceId],
    queryFn: () => api<CustomFieldDef[]>(`/search/${workspaceId}/custom-fields`),
  })
  const selectedCustomField = customFieldsQuery.data?.find((f) => f.id === customFieldId)

  type SavedSearch = { id: string; name: string; query: string | null; filters: Record<string, unknown> }
  const savedQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['saved-searches', workspaceId],
    queryFn: () => api<SavedSearch[]>(`/search/${workspaceId}/saved`),
  })
  const applyPreset = (s: SavedSearch) => {
    const f = s.filters ?? {}
    setQuery(s.query ?? '')
    setTypeFilter(new Set(((f.types as SearchEntityType[]) ?? []).filter((x) => ENTITY_ORDER.includes(x))))
    setSortBy((f.sort as 'updated' | 'created') ?? 'relevance')
    setStatusFilter((f.statusCategory as any) ?? '')
    setPriorityFilter((f.priority as any) ?? '')
    setLabelFilter((f.labelId as string) ?? '')
    setTaskTypeFilter((f.taskTypeId as string) ?? '')
    setAssigneeFilter((f.assigneeId as string) ?? '')
    setCreatorFilter((f.creatorId as string) ?? '')
    setIncludeArchived(f.includeArchived === true)
    setDueAfter((f.dueAfter as string) ?? '')
    setDueBefore((f.dueBefore as string) ?? '')
    setCustomFieldId((f.customFieldId as string) ?? '')
    setCustomFieldValue((f.customFieldValue as string) ?? '')
  }
  const saveCurrent = useMutation({
    mutationFn: (name: string) => {
      const filters: Record<string, unknown> = {}
      if (typeFilter.size) filters.types = [...typeFilter]
      if (sortBy !== 'relevance') filters.sort = sortBy
      if (statusFilter) filters.statusCategory = statusFilter
      if (priorityFilter) filters.priority = priorityFilter
      if (labelFilter) filters.labelId = labelFilter
      if (taskTypeFilter) filters.taskTypeId = taskTypeFilter
      if (assigneeFilter) filters.assigneeId = assigneeFilter
      if (creatorFilter) filters.creatorId = creatorFilter
      if (includeArchived) filters.includeArchived = true
      if (dueAfter) filters.dueAfter = dueAfter
      if (dueBefore) filters.dueBefore = dueBefore
      if (customFieldId && customFieldValue) {
        filters.customFieldId = customFieldId
        filters.customFieldValue = customFieldValue
      }
      return api(`/search/${workspaceId}/saved`, { method: 'POST', body: { name, query, filters } })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', workspaceId] }),
  })
  const deletePreset = useMutation({
    mutationFn: (id: string) => api(`/search/${workspaceId}/saved/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches', workspaceId] }),
  })

  const membersQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string }>>(`/workspaces/${workspaceId}/members`),
  })

  const hasCustomField = customFieldId !== '' && customFieldValue !== ''
  // §A2.4 — the tally on the Filters button. Each active control counts once.
  const activeFilterCount =
    typeFilter.size + (sortBy !== 'relevance' ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (priorityFilter ? 1 : 0) +
    (labelFilter ? 1 : 0) +
    (taskTypeFilter ? 1 : 0) +
    (assigneeFilter ? 1 : 0) +
    (creatorFilter ? 1 : 0) +
    (includeArchived ? 1 : 0) +
    (dueAfter ? 1 : 0) +
    (dueBefore ? 1 : 0) +
    (hasCustomField ? 1 : 0)
  const hasFilter = activeFilterCount > 0

  // §A2.1 — a query that opens with `/` is a command lookup, not a search.
  const commandMode = query.startsWith('/')
  const commandNeedle = commandMode ? query.slice(1).trim().toLowerCase() : ''

  const searchQuery = useQuery({
    enabled: open && Boolean(workspaceId) && !commandMode && (query.trim().length > 0 || hasFilter),
    queryKey: ['search', workspaceId, query, typeParam, sortBy, statusFilter, priorityFilter, labelFilter, taskTypeFilter, assigneeFilter, creatorFilter, includeArchived, dueAfter, dueBefore, customFieldId, customFieldValue],
    queryFn: () => {
      const params = new URLSearchParams({ q: query })
      if (typeParam) params.set('types', typeParam)
      if (sortBy !== 'relevance') params.set('sort', sortBy)
      if (statusFilter) params.set('statusCategory', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      if (labelFilter) params.set('labelId', labelFilter)
      if (taskTypeFilter) params.set('taskTypeId', taskTypeFilter)
      if (assigneeFilter) params.set('assigneeId', assigneeFilter)
      if (creatorFilter) params.set('creatorId', creatorFilter)
      if (includeArchived) params.set('includeArchived', 'true')
      if (dueAfter) params.set('dueAfter', dueAfter)
      if (dueBefore) params.set('dueBefore', dueBefore)
      if (hasCustomField) {
        params.set('customFieldId', customFieldId)
        params.set('customFieldValue', customFieldValue)
      }
      return api<SearchHit[]>(`/search/${workspaceId}?${params.toString()}`)
    },
  })

  const createTask = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !query.trim()) return
      const spaces = await api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}`)
      const projects = await api<Array<{ id: string }>>(`/projects/space/${spaces[0].id}`)
      const lists = await api<Array<{ id: string }>>(`/lists/project/${projects[0].id}`)
      return api(`/tasks`, {
        method: 'POST',
        body: JSON.stringify({ listId: lists[0].id, title: query.trim() }),
      })
    },
    onSuccess: () => {
      setOpen(false)
      setQuery('')
    },
  })

  // Global ⌘K hotkey
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  function go(to: string) {
    setOpen(false)
    setQuery('')
    if (to.startsWith('/app/')) navigate({ to: to as '/app' })
  }

  const navTargets = workspaceId
    ? [
        { icon: LayoutDashboard, label: t('nav.dashboards'), to: `/app/${workspaceId}/dashboard` },
        { icon: GanttChart, label: t('nav.timeline'), to: `/app/${workspaceId}/timeline` },
        { icon: Inbox, label: t('nav.inbox'), to: `/app/${workspaceId}/inbox` },
        { icon: MessageCircleReply, label: t('replies.title'), to: `/app/${workspaceId}/replies` },
        { icon: MessageSquare, label: t('nav.chat'), to: `/app/${workspaceId}/chat` },
        { icon: FileText, label: t('nav.docs'), to: `/app/${workspaceId}/docs` },
        { icon: Target, label: t('nav.goals'), to: `/app/${workspaceId}/goals` },
        { icon: Sparkles, label: t('nav.ai'), to: `/app/${workspaceId}/ai` },
        { icon: Zap, label: t('nav.automations'), to: `/app/${workspaceId}/automations` },
        { icon: Settings, label: t('nav.settings'), to: `/app/${workspaceId}/settings` },
      ]
    : []

  const visibleCommands = navTargets.filter(
    (c) => !commandNeedle || c.label.toLowerCase().includes(commandNeedle),
  )

  const actionHit = searchQuery.data?.find((h) => h.id === actionsForId) ?? null

  // §A2.1 — Tab hands the highlighted row to its action menu. cmdk keeps focus
  // in the input and marks the active row with aria-selected, so that is where
  // the selection is read from.
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    if (actionsForId) {
      setActionsForId(null)
      return
    }
    const selected = document.querySelector('[cmdk-item][aria-selected="true"]')
    const value = selected?.getAttribute('data-value') ?? ''
    const hit = searchQuery.data?.find((h) => value.startsWith(`${h.entityType}-${h.id}-`))
    if (hit) setActionsForId(hit.id)
  }

  const copyLink = async (hit: SearchHit) => {
    const url = `${window.location.origin}${hit.url}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* Clipboard blocked (insecure context or denied) — nothing else to do. */
    }
    setActionsForId(null)
    setOpen(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      // In command mode the leading `/` would score every item to zero, so the
      // filtering is ours; everywhere else cmdk's fuzzy match still runs.
      commandProps={{ shouldFilter: !commandMode }}
      // Screen-reader name for the dialog. Sighted users identify the palette
      // by its input; Radix requires a title regardless.
      title={t('palette.title')}
    >
      <CommandInput
        placeholder={t('palette.searchPlaceholder')}
        value={query}
        onValueChange={(next) => {
          setQuery(next)
          setActionsForId(null)
        }}
        onKeyDown={handleInputKeyDown}
      />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/60">
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
            activeFilterCount > 0
              ? 'border-brand-500 bg-brand-500/10 text-foreground'
              : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/10',
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {activeFilterCount > 0 ? t('palette.filtersCount', { count: activeFilterCount }) : t('palette.filters')}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter(new Set())
              setSortBy('relevance')
              setStatusFilter('')
              setPriorityFilter('')
              setLabelFilter('')
              setTaskTypeFilter('')
              setAssigneeFilter('')
              setCreatorFilter('')
              setIncludeArchived(false)
              setDueAfter('')
              setDueBefore('')
              setCustomFieldId('')
              setCustomFieldValue('')
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t('palette.clearFilters')}
          </button>
        )}
      </div>
      <div
        className={cn(
          'flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b border-border/60',
          filtersOpen ? 'flex' : 'hidden',
        )}
      >
        <FilterGroup label={t('palette.filterType')}>
          <FilterChip active={typeFilter.size === 0} onClick={() => setTypeFilter(new Set())}>
            {t('palette.all')}
          </FilterChip>
          {ENTITY_ORDER.map((v) => (
            <FilterChip key={v} active={typeFilter.has(v)} onClick={() => toggleType(v)}>
              {t(ENTITY_LABEL_KEY[v])}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('palette.filterSort')}>
          {([
            ['relevance', 'palette.sortRelevance'],
            ['updated', 'palette.sortUpdated'],
            ['created', 'palette.sortCreated'],
          ] as const).map(([v, key]) => (
            <FilterChip key={v} active={sortBy === v} onClick={() => setSortBy(v)}>
              {t(key)}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('palette.filterStatus')}>
          {(['open', 'in_progress', 'closed'] as const).map((v) => (
            <FilterChip
              key={v}
              active={statusFilter === v}
              onClick={() => setStatusFilter((cur) => (cur === v ? '' : v))}
            >
              {v === 'open' ? t('palette.statusTodo') : v === 'in_progress' ? t('palette.statusActive') : t('palette.statusClosed')}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('palette.filterPriority')}>
          {(['urgent', 'high', 'normal', 'low'] as const).map((v) => (
            <FilterChip
              key={v}
              active={priorityFilter === v}
              onClick={() => setPriorityFilter((cur) => (cur === v ? '' : v))}
            >
              {t(PRIORITY_LABEL_KEY[v])}
            </FilterChip>
          ))}
        </FilterGroup>
        {(labelsQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterLabel')}>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.filterAny')}</option>
              {labelsQuery.data!.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}
        {(taskTypesQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterTaskType')}>
            <select
              value={taskTypeFilter}
              onChange={(e) => setTaskTypeFilter(e.target.value)}
              data-testid="palette-task-type-filter"
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.filterAny')}</option>
              {taskTypesQuery.data!.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}
        {(membersQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterAssignee')}>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.filterAnyone')}</option>
              {membersQuery.data!.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}
        {(membersQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterCreator')}>
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.filterAnyone')}</option>
              {membersQuery.data!.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}
        <FilterGroup label={t('palette.filterArchived')}>
          <FilterChip active={includeArchived} onClick={() => setIncludeArchived((v) => !v)}>
            {t('palette.includeArchived')}
          </FilterChip>
        </FilterGroup>
        <FilterGroup label={t('palette.filterDue')}>
          <input
            type="date"
            value={dueAfter}
            onChange={(e) => setDueAfter(e.target.value)}
            title={t('palette.dueAfter')}
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
          <span className="text-[11px] text-muted-foreground/60">→</span>
          <input
            type="date"
            value={dueBefore}
            onChange={(e) => setDueBefore(e.target.value)}
            title={t('palette.dueBefore')}
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
        </FilterGroup>
        {(customFieldsQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterCustomField')}>
            <select
              value={customFieldId}
              onChange={(e) => {
                setCustomFieldId(e.target.value)
                setCustomFieldValue('')
              }}
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.customFieldPick')}</option>
              {customFieldsQuery.data!.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.projectName}
                </option>
              ))}
            </select>
            {customFieldId !== '' &&
              (selectedCustomField?.type === 'dropdown' ? (
                <select
                  value={customFieldValue}
                  onChange={(e) => setCustomFieldValue(e.target.value)}
                  className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
                >
                  <option value="">{t('palette.filterAny')}</option>
                  {(selectedCustomField?.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={selectedCustomField?.type === 'number' || selectedCustomField?.type === 'money' || selectedCustomField?.type === 'rating' ? 'number' : selectedCustomField?.type === 'date' ? 'date' : 'text'}
                  value={customFieldValue}
                  onChange={(e) => setCustomFieldValue(e.target.value)}
                  placeholder={t('palette.customFieldValuePlaceholder')}
                  className="h-6 w-28 rounded-md border border-border/70 bg-transparent px-1.5 text-[11px] text-muted-foreground"
                />
              ))}
          </FilterGroup>
        )}
      </div>
      {(((savedQuery.data?.length ?? 0) > 0) || hasFilter || query.trim()) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 -mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mr-0.5">
            {t('palette.presets')}
          </span>
          {savedQuery.data?.map((s) => (
            <span key={s.id} className="inline-flex items-center rounded-full border border-border/70 text-[11px]">
              <button
                type="button"
                onClick={() => applyPreset(s)}
                className="pl-2 pr-1 py-0.5 text-muted-foreground hover:text-foreground"
              >
                {s.name}
              </button>
              <button
                type="button"
                aria-label={t('palette.deletePreset', { name: s.name })}
                onClick={() => deletePreset.mutate(s.id)}
                className="px-1 py-0.5 text-muted-foreground/60 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
          {(hasFilter || query.trim()) && (
            <button
              type="button"
              disabled={saveCurrent.isPending}
              onClick={() => {
                const name = window.prompt(t('palette.savePrompt'))?.trim()
                if (name) saveCurrent.mutate(name)
              }}
              className="rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/10"
            >
              + {t('palette.saveCurrent')}
            </button>
          )}
        </div>
      )}
      <CommandList>
        <CommandEmpty>
          {commandMode ? (
            <span>{t('palette.noCommandMatch')}</span>
          ) : query.trim() ? (
            <span>
              {t('palette.noMatchesBefore')}<CommandShortcut>↵</CommandShortcut>{t('palette.noMatchesAfter')}
            </span>
          ) : hasFilter ? (
            <span>{t('palette.noFilterMatch')}</span>
          ) : (
            <span>{t('palette.startTyping')}</span>
          )}
        </CommandEmpty>

        {/* §A2.1 — `/` lists the whole command set instead of leaving the user
            to guess which words happen to match a command. */}
        {commandMode && (
          <CommandGroup heading={t('palette.commands')}>
            {visibleCommands.map(({ icon: Icon, label, to }) => (
              <CommandItem key={to} value={`command-${label}`} onSelect={() => go(to)}>
                <Icon className="text-muted-foreground" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* §A2.1 — extra actions for the row Tab was pressed on. */}
        {!commandMode && actionHit && (
          <CommandGroup heading={t('palette.actionsOn', { title: actionHit.title })}>
            <CommandItem value={`__action_open__${query}`} onSelect={() => go(actionHit.url)}>
              <ArrowRight className="text-muted-foreground" />
              {t('palette.actionOpen')}
            </CommandItem>
            <CommandItem value={`__action_copy__${query}`} onSelect={() => void copyLink(actionHit)}>
              <LinkIcon className="text-muted-foreground" />
              {t('palette.actionCopyLink')}
            </CommandItem>
            <CommandItem value={`__action_back__${query}`} onSelect={() => setActionsForId(null)}>
              <ArrowLeft className="text-muted-foreground" />
              {t('palette.actionBack')}
            </CommandItem>
          </CommandGroup>
        )}

        {/* Quick action — create task from query */}
        {!commandMode && query.trim() && workspaceId && (
          <CommandGroup heading={t('palette.quickActions')}>
            {/* §A2.3 — the typed question used to be dropped on the way to the
                AI page; it now goes straight to the assistant. */}
            {onAskAi && (
              <CommandItem
                value={`__ask_ai__${query}`}
                onSelect={() => {
                  const question = query.trim()
                  setOpen(false)
                  setQuery('')
                  onAskAi(question)
                }}
              >
                <Sparkles className="text-accent" />
                {t('palette.askAi')}{' '}
                <span className="font-medium text-foreground">&quot;{query.trim()}&quot;</span>
              </CommandItem>
            )}
            <CommandItem onSelect={() => createTask.mutate()} value={`__create__${query}`}>
              <Plus className="text-accent" />
              {t('palette.createTask')} <span className="font-medium text-foreground">&quot;{query.trim()}&quot;</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search results */}
        {!commandMode && searchQuery.data && searchQuery.data.length > 0 && (
          <>
            <CommandSeparator />
            {/* Results grouped by entity type (§11.1) */}
            {ENTITY_ORDER.filter((et) => searchQuery.data!.some((h) => h.entityType === et)).map((type) => (
              <CommandGroup key={type} heading={ENTITY_LABEL_KEY[type] ? t(ENTITY_LABEL_KEY[type]) : type}>
                {searchQuery.data!
                  .filter((h) => h.entityType === type)
                  .map((hit) => {
                    const Icon = ENTITY_ICON[hit.entityType] ?? FileText
                    return (
                      <CommandItem
                        key={hit.id}
                        value={`${hit.entityType}-${hit.id}-${hit.title}`}
                        onSelect={() => go(hit.url)}
                      >
                        <Icon className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{hit.title}</div>
                          {hit.content && (
                            <div className="truncate text-xs text-muted-foreground">{hit.content}</div>
                          )}
                        </div>
                        <ArrowRight className="text-muted-foreground" />
                      </CommandItem>
                    )
                  })}
              </CommandGroup>
            ))}
          </>
        )}

        {/* Navigation shortcuts */}
        {!commandMode && !query.trim() && navTargets.length > 0 && (
          <CommandGroup heading={t('palette.jumpTo')}>
            {navTargets.map(({ icon: Icon, label, to }) => (
              <CommandItem key={to} value={`nav-${label}`} onSelect={() => go(to)}>
                <Icon className="text-muted-foreground" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      {/* §A2.1 — the keys are only discoverable if the modal names them. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>{t('palette.hintNavigate')}</span>
        <span>{t('palette.hintOpen')}</span>
        <span>{t('palette.hintActions')}</span>
        <span>{t('palette.hintCommands')}</span>
        <span>{t('palette.hintClose')}</span>
      </div>
    </CommandDialog>
  )
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mr-0.5">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
        active
          ? 'border-brand-500 bg-brand-500/10 text-foreground'
          : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/10',
      )}
    >
      {children}
    </button>
  )
}
