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
  MoreHorizontal,
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
import { forgetSearch, recentSearches, rememberSearch } from '../lib/recent-searches'
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
const ENTITY_ORDER = [
  'task', 'doc', 'file', 'comment', 'channel', 'message', 'user',
  // §2 [02:03] — the containers. Reached through the ⋯, like she did.
  'folder', 'list', 'space',
  // §4 [04:20] — the linked Google Drive, reached through the ⋯ like the rest.
  'drive',
] as const
/**
 * §2 [02:01] — "yeh 3 DOTS dekh rahe hain? Main yahan se aur points pe click
 * out kar ke … to folders yahan pe appear ho jayega."
 *
 * The bar carries the everyday types; the rest live behind the ⋯ and are
 * promoted into it when chosen. Ten chips in one row is the thing she was
 * complaining about elsewhere — a wall of options nobody reads.
 */
const PRIMARY_TYPES: readonly SearchEntityType[] = ['task', 'doc', 'file', 'user']
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
  folder: 'palette.entityFolders',
  list: 'palette.entityLists',
  space: 'palette.entitySpaces',
  drive: 'palette.entityDrive',
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
  /** Types promoted out of the ⋯ menu and now showing as chips. */
  const [revealedTypes, setRevealedTypes] = useState<Set<SearchEntityType>>(() => new Set())
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
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
  // Read when the palette opens rather than on every render: this is
  // localStorage, and the list only changes when a search is actually run.
  const [recents, setRecents] = useState<string[]>([])
  const [dueAfter, setDueAfter] = useState<string>('')
  const [dueBefore, setDueBefore] = useState<string>('')
  // §2 [04:00] — "last created date kya thi — dates ke lehaz par".
  const [createdAfter, setCreatedAfter] = useState<string>('')
  const [createdBefore, setCreatedBefore] = useState<string>('')
  // §2 [02:35] — Location: which space it sits in, or which list.
  const [spaceFilter, setSpaceFilter] = useState<string>('')
  /** The folder step between space and list — projects hang off a folder. */
  const [folderFilter, setFolderFilter] = useState<string>('')
  const [listFilter, setListFilter] = useState<string>('')
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
    const savedTypes = ((f.types as SearchEntityType[]) ?? []).filter((x) => ENTITY_ORDER.includes(x))
    setTypeFilter(new Set(savedTypes))
    // A saved search that narrows to Folders has to show the Folders chip, or
    // the filter is on with nothing on screen accounting for it.
    setRevealedTypes(new Set(savedTypes.filter((x) => !PRIMARY_TYPES.includes(x))))
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
    setCreatedAfter((f.createdAfter as string) ?? '')
    setCreatedBefore((f.createdBefore as string) ?? '')
    setSpaceFilter((f.spaceId as string) ?? '')
    setFolderFilter((f.folderId as string) ?? '')
    setListFilter((f.listId as string) ?? '')
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
      if (createdAfter) filters.createdAfter = createdAfter
      if (createdBefore) filters.createdBefore = createdBefore
      if (spaceFilter) filters.spaceId = spaceFilter
      if (folderFilter) filters.folderId = folderFilter
      if (listFilter) filters.listId = listFilter
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

  /** §2 [02:35] — the spaces a Location filter can name. */
  const spacesQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['location-spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
  })
  /**
   * The lists inside the chosen space. Fetched only once a space is picked —
   * "which list" is a question that only means anything after "which space",
   * and every list in the workspace at once is a haystack, not a location.
   */
  /**
   * §2 — the folders inside the chosen space. Same reasoning as the lists
   * below: "which folder" only means something once a space is picked.
   */
  const locationFoldersQuery = useQuery({
    enabled: open && Boolean(workspaceId) && Boolean(spaceFilter),
    queryKey: ['location-folders', spaceFilter],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/${spaceFilter}/folders`),
  })
  const locationListsQuery = useQuery({
    enabled: open && Boolean(workspaceId) && Boolean(spaceFilter),
    queryKey: ['location-lists', workspaceId, spaceFilter],
    queryFn: async () => {
      const projects = await api<Array<{ id: string; name: string }>>(`/projects/space/${spaceFilter}`)
      const perProject = await Promise.all(
        projects.map(async (pr) => {
          const lists = await api<Array<{ id: string; name: string }>>(`/lists/project/${pr.id}`)
          // Prefixed, because "Backlog" appears under half the projects in a
          // workspace and the bare name would not tell you which one you picked.
          return lists.map((l) => ({ id: l.id, name: `${pr.name} / ${l.name}` }))
        }),
      )
      return perProject.flat()
    },
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
    (createdAfter ? 1 : 0) +
    (createdBefore ? 1 : 0) +
    (spaceFilter ? 1 : 0) +
    (folderFilter ? 1 : 0) +
    (listFilter ? 1 : 0) +
    (hasCustomField ? 1 : 0)
  const hasFilter = activeFilterCount > 0

  // §A2.1 — a query that opens with `/` is a command lookup, not a search.
  const commandMode = query.startsWith('/')
  const commandNeedle = commandMode ? query.slice(1).trim().toLowerCase() : ''

  const searchQuery = useQuery({
    enabled: open && Boolean(workspaceId) && !commandMode && (query.trim().length > 0 || hasFilter),
    queryKey: ['search', workspaceId, query, typeParam, sortBy, statusFilter, priorityFilter, labelFilter, taskTypeFilter, assigneeFilter, creatorFilter, includeArchived, dueAfter, dueBefore, createdAfter, createdBefore, spaceFilter, folderFilter, listFilter, customFieldId, customFieldValue],
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
      if (createdAfter) params.set('createdAfter', createdAfter)
      if (createdBefore) params.set('createdBefore', createdBefore)
      if (spaceFilter) params.set('spaceId', spaceFilter)
      if (folderFilter) params.set('folderId', folderFilter)
      if (listFilter) params.set('listId', listFilter)
      if (hasCustomField) {
        params.set('customFieldId', customFieldId)
        params.set('customFieldValue', customFieldValue)
      }
      return api<SearchHit[]>(`/search/${workspaceId}?${params.toString()}`)
    },
  })

  /*
   * Remember a query only once it has ANSWERED.
   *
   * Recording on keystroke fills the list with prefixes of one word — "in",
   * "inv", "invo" — which is a worse list than none. Waiting for the search to
   * settle means what is remembered is what somebody actually asked.
   */
  useEffect(() => {
    if (!open || commandMode || searchQuery.isPending) return
    if (!searchQuery.isSuccess) return
    rememberSearch(workspaceId, query)
  }, [open, commandMode, searchQuery.isPending, searchQuery.isSuccess, workspaceId, query])

  // Refreshed as the palette opens: this is localStorage, not state anything
  // else writes to while it is on screen.
  useEffect(() => {
    if (open) setRecents(recentSearches(workspaceId))
  }, [open, workspaceId])


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
      /*
       * cmdk's fuzzy filter is off entirely, and has to be.
       *
       * It scores an item by its `value` string, and a search hit's value is
       * `${entityType}-${id}-${title}` — the title and nothing else. The server
       * searches titles AND bodies (`searchableAttributes: ['title','content']`),
       * so every hit that matched on a description, a doc body, a comment or a
       * chat message scored 0 here and cmdk unmounted it. The snippet was
       * already rendered underneath the title; the user saw "no matches" over
       * results the browser was holding. Chat messages could never appear at
       * all — the server titles them the literal string "Chat message", so the
       * words the user typed are never in the value being scored.
       *
       * Turning it off is right rather than merely expedient: by the time a
       * query exists, everything on screen is already query-derived — the
       * server filtered the hits and ranked them, and the quick actions are
       * meant to be unconditional. Leaving the filter on also RE-SORTED the
       * results by cmdk's score, quietly discarding the relevance order the
       * search engine just computed.
       *
       * The `__create__${query}` / `__ask_ai__${query}` values below are the
       * scars of this: the query was being stuffed into item values so that
       * cmdk would not drop the quick actions either.
       */
      commandProps={{ shouldFilter: false }}
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
      {/*
        §2 [01:33] — "main 'Task' par click karoongi na — to agar aap yeh dekh
        rahe ho to yeh GRAY COLOR ho gaya, to woh task mein is cheez ko search
        karna start ho jayega."
        She reaches for a type immediately. This row used to sit inside the
        collapsible panel below, so narrowing to Tasks or Docs — the first thing
        she does — cost a click on "Filters" first, and the ⋯ she describes was
        two levels down. The type chips are part of the search bar; the rest are
        filters.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b border-border/60">
        <FilterGroup label={t('palette.filterType')}>
          <FilterChip active={typeFilter.size === 0} onClick={() => setTypeFilter(new Set())}>
            {t('palette.all')}
          </FilterChip>
          {ENTITY_ORDER.filter(
            (v) => PRIMARY_TYPES.includes(v) || revealedTypes.has(v) || typeFilter.has(v),
          ).map((v) => (
            <FilterChip
              key={v}
              active={typeFilter.has(v)}
              onClick={() => toggleType(v)}
              testId={`palette-type-${v}`}
            >
              {t(ENTITY_LABEL_KEY[v])}
            </FilterChip>
          ))}
          {/*
            §2 [02:01] — the ⋯. Choosing a type from here makes its chip appear
            in the bar; clicking that chip is what actually searches in it, the
            two steps she described.
          */}
          {ENTITY_ORDER.some((v) => !PRIMARY_TYPES.includes(v) && !revealedTypes.has(v) && !typeFilter.has(v)) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeMenuOpen((v) => !v)}
                aria-expanded={typeMenuOpen}
                aria-label={t('palette.moreTypes')}
                title={t('palette.moreTypes')}
                data-testid="palette-more-types"
                className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
              {typeMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setTypeMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute left-0 z-50 mt-1 w-44 rounded-lg border border-border/70 bg-card p-1 shadow-xl"
                    data-testid="palette-more-types-menu"
                  >
                    {ENTITY_ORDER.filter(
                      (v) => !PRIMARY_TYPES.includes(v) && !revealedTypes.has(v) && !typeFilter.has(v),
                    ).map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-testid={`palette-add-type-${v}`}
                        onClick={() => {
                          setRevealedTypes((prev) => new Set(prev).add(v))
                          setTypeMenuOpen(false)
                        }}
                        className="w-full rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                      >
                        {t(ENTITY_LABEL_KEY[v])}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </FilterGroup>
      </div>
      <div
        className={cn(
          'flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b border-border/60',
          filtersOpen ? 'flex' : 'hidden',
        )}
      >
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
        {/*
          §2 [04:00] — "abhi hua tha yeh — last created date kya thi". A separate
          question from the due dates above: when it was made, not when it is owed.
        */}
        <FilterGroup label={t('palette.filterCreated')}>
          <input
            type="date"
            value={createdAfter}
            onChange={(e) => setCreatedAfter(e.target.value)}
            title={t('palette.createdAfter')}
            aria-label={t('palette.createdAfter')}
            data-testid="palette-created-after"
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
          <span className="text-[11px] text-muted-foreground/60">→</span>
          <input
            type="date"
            value={createdBefore}
            onChange={(e) => setCreatedBefore(e.target.value)}
            title={t('palette.createdBefore')}
            aria-label={t('palette.createdBefore')}
            data-testid="palette-created-before"
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
        </FilterGroup>
        {/*
          §2 [02:35] — "LOCATION ka matlab yeh hota hai ke woh kis space mein
          para hai, ya kis list mein para hai." Space first; the list options
          follow whichever space is chosen, because a flat list of every list in
          the workspace is not a location, it is a haystack.
        */}
        {(spacesQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterLocation')}>
            <select
              value={spaceFilter}
              onChange={(e) => {
                setSpaceFilter(e.target.value)
                // The old folder and list belong to the old space.
                setFolderFilter('')
                setListFilter('')
              }}
              aria-label={t('palette.filterSpace')}
              data-testid="palette-space-filter"
              className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
            >
              <option value="">{t('palette.filterAnywhere')}</option>
              {spacesQuery.data!.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
            {(locationFoldersQuery.data?.length ?? 0) > 0 && (
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                aria-label={t('palette.filterFolder')}
                data-testid="palette-folder-filter"
                className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
              >
                <option value="">{t('palette.filterAnyFolder')}</option>
                {locationFoldersQuery.data!.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {(locationListsQuery.data?.length ?? 0) > 0 && (
              <select
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                aria-label={t('palette.filterList')}
                data-testid="palette-list-filter"
                className="h-6 rounded-full border border-border/70 bg-transparent px-2 text-[11px] text-muted-foreground"
              >
                <option value="">{t('palette.filterAnyList')}</option>
                {locationListsQuery.data!.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </FilterGroup>
        )}
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
      {/*
        * Recent searches — only with an empty box.
        *
        * `[01:24]` a search that found nothing is usually followed by the same
        * search spelled differently, and retyping it from memory is the part
        * that wastes the minute. Hidden the moment somebody types, because by
        * then they have moved on from the list and it is just noise above the
        * results they asked for.
        */}
      {!commandMode && !query.trim() && recents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 -mt-1" data-testid="palette-recents">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mr-0.5">
            {t('palette.recent')}
          </span>
          {recents.map((r) => (
            <span key={r} className="inline-flex items-center rounded-full border border-border/70 text-[11px]">
              <button
                type="button"
                onClick={() => setQuery(r)}
                className="pl-2 pr-1 py-0.5 text-muted-foreground hover:text-foreground"
              >
                {r}
              </button>
              <button
                type="button"
                aria-label={t('palette.forgetRecent', { query: r })}
                onClick={() => {
                  forgetSearch(workspaceId, r)
                  setRecents(recentSearches(workspaceId))
                }}
                className="px-1 py-0.5 text-muted-foreground/60 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

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
  testId,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
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
