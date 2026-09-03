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
  PersonAvatar,
  cn,
} from '@rundesk/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarClock,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
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
  Play,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Users,
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { forgetSearch, recentSearches, rememberSearch } from '../lib/recent-searches'
import { rememberRevealedTypes, revealedTypesFor } from '../lib/revealed-types'
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
  meeting: CalendarClock,
}
const ENTITY_ORDER = [
  'task', 'doc', 'file', 'comment', 'channel', 'message', 'user',
  // §2 [02:03] — the containers. Reached through the ⋯, like she did.
  'folder', 'list', 'space',
  // §4 [04:20] — the linked Google Drive, reached through the ⋯ like the rest.
  'drive',
  // §G14-15 — meeting notes, often the only written record of a decision.
  'meeting',
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
  meeting: 'palette.entityMeetings',
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
  /**
   * §G02-6 — types promoted out of the ⋯ menu and now showing as chips.
   *
   * Seeded from storage rather than empty. The palette is mounted only while
   * it is open, so a chip promoted here used to vanish the moment it closed:
   * the control worked exactly once and then undid itself.
   */
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

  // §G02-6 — restore the promoted chips for this workspace. Keyed on
  // workspaceId as well as `open`, because switching workspace inside an open
  // palette should bring that workspace's chips, not keep the last one's.
  useEffect(() => {
    if (!open) return
    setRevealedTypes(
      new Set(
        revealedTypesFor(workspaceId).filter(
          (t): t is SearchEntityType => (ENTITY_ORDER as readonly string[]).includes(t),
        ),
      ),
    )
  }, [open, workspaceId])


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

  /*
   * §G02 [03:52 / 04:32], frames 061_0352 and 071_0432 — "No exact matches
   * found, but here's a relevant answer from ✨ Brain".
   *
   * Her zero-result state does not dead-end: the query goes to the assistant
   * and the answer appears inline, in the same modal. Ours printed "No matches
   * — try a different keyword", which is the dead end she is pointing at.
   *
   * Debounced separately from the search. The search re-keys on every
   * keystroke and that is fine — it is a cheap index read. An assistant call
   * per keystroke is not, so this trails the box and fires once, on text that
   * has stopped moving.
   */
  const [settledQuery, setSettledQuery] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setSettledQuery(query.trim()), 700)
    return () => clearTimeout(id)
  }, [query])

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
   * §G02 — the answer that fills the dead end.
   *
   * Fires only when all of these hold, and each one is load-bearing:
   *   · the text has stopped moving (settledQuery), so this is one call and not
   *     one per keystroke — an index read is cheap, an assistant is not;
   *   · the search has ANSWERED for the current text and found nothing. Asking
   *     while results are still in flight would put an AI answer under a list
   *     that is about to appear;
   *   · there is a workspace to ground it in, and we are not in command mode.
   *
   * Three characters minimum: below that the query is not a question, and the
   * answer would be noise on the way to typing a real one.
   */
  const searchFoundNothing =
    !commandMode &&
    settledQuery.length >= 3 &&
    settledQuery === query.trim() &&
    !searchQuery.isFetching &&
    Array.isArray(searchQuery.data) &&
    searchQuery.data.length === 0

  const aiAnswer = useQuery({
    enabled: open && Boolean(workspaceId) && searchFoundNothing,
    queryKey: ['palette-ai-answer', workspaceId, settledQuery],
    // The answer for a given question does not change minute to minute, and
    // re-asking on every reopen would spend a model call to say the same thing.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: () =>
      api<{
        answer: string
        sources?: Array<{ title?: string; url?: string }>
        feedback?: 'up' | 'down' | null
      }>('/ai/knowledge', {
        method: 'POST',
        body: { workspaceId, question: settledQuery },
      }),
  })

  /*
   * §G02 — the controls under the answer.
   *
   * `answerFeedback` is held locally and seeded from the server's reply rather
   * than read straight off `aiAnswer.data`, because a thumb has to light the
   * instant it is pressed: the answer itself is cached for five minutes, so
   * re-fetching it to learn the result of your own click would leave the
   * control dead for a round trip and then jump.
   *
   * `undefined` means "not yet seeded from the server", which is distinct from
   * `null` meaning "no rating" — collapsing the two would make the seeding
   * effect below overwrite a click that landed while the answer was arriving.
   */
  const [answerFeedback, setAnswerFeedback] = useState<'up' | 'down' | null | undefined>(undefined)
  const [answerCopied, setAnswerCopied] = useState(false)

  // A new question is a new answer: forget the previous one's rating and its
  // copied flag, or the thumb from the last query stays lit under this one.
  useEffect(() => {
    setAnswerFeedback(undefined)
    setAnswerCopied(false)
  }, [settledQuery, workspaceId])

  useEffect(() => {
    if (aiAnswer.data && answerFeedback === undefined) {
      setAnswerFeedback(aiAnswer.data.feedback ?? null)
    }
  }, [aiAnswer.data, answerFeedback])

  const rateAnswer = (rating: 'up' | 'down') => {
    // Pressing the lit thumb clears it — the convention the AI chat already
    // uses, so the two feedback controls in the product agree with each other.
    const next = answerFeedback === rating ? null : rating
    setAnswerFeedback(next)
    void api('/ai/knowledge/feedback', {
      method: 'PATCH',
      body: { workspaceId, question: settledQuery, feedback: next },
    }).catch(() => {
      // Put the control back rather than leave it showing an opinion the
      // server never recorded.
      setAnswerFeedback(answerFeedback ?? null)
    })
  }

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
    if (to.startsWith('/app/')) {
      navigate({ to: to as '/app' })
      return
    }
    /*
     * §G03-5 — a federated hit carries an absolute URL into another product
     * (Google Drive today). The router cannot route one, and the old guard
     * dropped it on the floor: every Drive result closed the palette and did
     * nothing at all. The server had already made the promise — it labels those
     * rows "Google Drive" precisely so you know a click leaves — and nothing
     * kept it.
     *
     * New tab, so the workspace she was reading is still there when she comes
     * back. http(s) only: the URL arrives from an external provider, and
     * `javascript:` in a window.open is a script running on this origin.
     */
    if (/^https?:\/\//i.test(to)) window.open(to, '_blank', 'noopener,noreferrer')
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
        { icon: Play, label: t('nav.sprints'), to: `/app/${workspaceId}/sprints` },
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
          data-testid="palette-filters-toggle"
          data-active-filters={activeFilterCount}
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
            data-testid="palette-clear-filters"
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
              /*
               * These five count toward `activeFilterCount` and were not being
               * reset, so "Clear filters" left the button lit and the results
               * still narrowed — a control saying it had done something it had
               * not. `palette-filters.test.ts` now derives both lists from this
               * file and fails if they drift apart again, which is the only
               * reason they stayed out of step long enough to ship.
               */
              setCreatedAfter('')
              setCreatedBefore('')
              setSpaceFilter('')
              setFolderFilter('')
              setListFilter('')
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
          <FilterChip
            active={typeFilter.size === 0}
            onClick={() => setTypeFilter(new Set())}
            testId="palette-type-all"
          >
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
                          setRevealedTypes((prev) => {
                            const next = new Set(prev).add(v)
                            rememberRevealedTypes(workspaceId, next)
                            return next
                          })
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
          {/*
            G03-9 — her Status submenu (frames 047/052) reads "All ✓ / Active /
            Closed": All is a visible, checked default, not the absence of a
            choice. Type already worked this way; Status and Priority did not,
            so clearing them meant clicking the active chip a second time and
            hoping. Same chip, same meaning, in all three groups.
          */}
          <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')} testId="palette-status-all">
            {t('palette.all')}
          </FilterChip>
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
          <FilterChip active={priorityFilter === ''} onClick={() => setPriorityFilter('')} testId="palette-priority-all">
            {t('palette.all')}
          </FilterChip>
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
            <PeoplePicker
              label={t('palette.filterAssignee')}
              members={membersQuery.data!}
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              testId="palette-assignee"
            />
          </FilterGroup>
        )}
        {(membersQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label={t('palette.filterCreator')}>
            <PeoplePicker
              label={t('palette.filterCreator')}
              members={membersQuery.data!}
              value={creatorFilter}
              onChange={setCreatorFilter}
              testId="palette-creator"
            />
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

        {/*
          §G02 [03:52 / 04:32], frames 061_0352 and 071_0432 — "No exact matches
          found, but here's a relevant answer from ✨ Brain".

          Rendered here rather than inside <CommandEmpty>, which never appears:
          cmdk only shows that when the list holds NO items, and the Quick
          actions below always render for a non-empty query. Measured — with a
          nonsense query the palette shows "Ask AI" and "Create task" and the
          empty-state text is not in the DOM at all. So the zero-result state
          this was filed against was not static text; it did not exist.
        */}
        {searchFoundNothing && (aiAnswer.isFetching || aiAnswer.data) && (
          <div className="px-3 pb-2" data-testid="palette-ai-answer">
            <div className="rounded-md border border-border/60 bg-card/60 p-2">
              <div className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-accent" />
                {t('palette.aiAnswerHeading')}
              </div>
              {aiAnswer.isFetching ? (
                <p className="text-[12px] text-muted-foreground" data-testid="palette-ai-thinking">
                  {t('palette.aiAnswerThinking')}
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-[13px] text-foreground" data-testid="palette-ai-text">
                    {aiAnswer.data?.answer}
                  </p>
                  {/*
                    The sources are the reason to trust the answer. Rendering
                    the prose alone would ask her to take a generated paragraph
                    on faith when the thing it was generated from is one click
                    away — and the retrieval is semantic, so these are exactly
                    the items the keyword search she just ran could not find.
                  */}
                  {(aiAnswer.data?.sources ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1.5" data-testid="palette-ai-sources">
                      {(aiAnswer.data?.sources ?? []).slice(0, 4).map((s, i) => (
                        <button
                          key={`${s.url ?? ''}-${i}`}
                          type="button"
                          disabled={!s.url}
                          data-testid="palette-ai-source"
                          className="max-w-[180px] truncate rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:cursor-default disabled:opacity-60"
                          onClick={() => {
                            if (!s.url) return
                            setOpen(false)
                            navigate({ to: s.url })
                          }}
                        >
                          {s.title || s.url}
                        </button>
                      ))}
                    </div>
                  )}
                  {/*
                    §G02 frames 020_0124–035_0203 — copy, thumbs, and a way to
                    carry the question into the assistant proper. The palette
                    answer is a paragraph in a dropdown; "Continue with Brain"
                    is what turns it into a conversation, and without it the
                    answer is a cul-de-sac with better scenery.
                  */}
                  <div className="flex items-center gap-1 pt-2">
                    <button
                      type="button"
                      data-testid="palette-ai-copy"
                      title={t('palette.aiAnswerCopy')}
                      aria-label={t('palette.aiAnswerCopy')}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        const text = aiAnswer.data?.answer ?? ''
                        if (!text) return
                        // Older/locked-down browsers have no clipboard API;
                        // swallowing the rejection keeps a copy button from
                        // throwing an unhandled error into the palette.
                        void navigator.clipboard?.writeText(text).catch(() => {})
                        setAnswerCopied(true)
                      }}
                    >
                      {answerCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      data-testid="palette-ai-up"
                      data-active={answerFeedback === 'up' ? 'true' : 'false'}
                      title={t('palette.aiAnswerUp')}
                      aria-label={t('palette.aiAnswerUp')}
                      aria-pressed={answerFeedback === 'up'}
                      className={`rounded p-1 hover:bg-muted ${answerFeedback === 'up' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => rateAnswer('up')}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      data-testid="palette-ai-down"
                      data-active={answerFeedback === 'down' ? 'true' : 'false'}
                      title={t('palette.aiAnswerDown')}
                      aria-label={t('palette.aiAnswerDown')}
                      aria-pressed={answerFeedback === 'down'}
                      className={`rounded p-1 hover:bg-muted ${answerFeedback === 'down' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => rateAnswer('down')}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                    {onAskAi && (
                      <button
                        type="button"
                        data-testid="palette-ai-continue"
                        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-muted"
                        onClick={() => {
                          const question = settledQuery
                          setOpen(false)
                          setQuery('')
                          onAskAi(question)
                        }}
                      >
                        <Sparkles className="h-3 w-3" />
                        {t('palette.aiAnswerContinue')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
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

type Member = { userId: string; displayName: string; email: string }

/**
 * G02-7 [02:14] — "yeh kisi aur ko assign hai, ya phir is ka creator kaun hai".
 *
 * Assignee and Creator both worked already; both were a native `<select>`
 * listing every member of the workspace. Her frames (040_0225) show something
 * different in kind: the parent row carries the current value inline —
 * "Assignee · Anyone ›" — and opening it gives a "Search…" box over avatar +
 * name rows. That difference is not decoration. A `<select>` of forty people
 * is a scroll with no type-ahead, and an agency workspace passes forty people
 * long before it stops needing this filter.
 *
 * One component for both, because they are the same question asked about two
 * columns, and two divergent implementations of one control is how the two
 * quietly stop behaving alike.
 */
function PeoplePicker({
  label,
  members,
  value,
  onChange,
  testId,
}: {
  label: string
  members: Member[]
  value: string
  onChange: (userId: string) => void
  testId: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [needle, setNeedle] = useState('')

  const nameOf = (m: Member) => m.displayName || m.email
  const selected = members.find((m) => m.userId === value)

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase()
    if (!q) return members
    // Email as well as name: half of "who is this" in a workspace is answered
    // by the address, especially where two people share a first name.
    return members.filter(
      (m) => nameOf(m).toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    )
  }, [members, needle])

  const choose = (userId: string) => {
    onChange(userId)
    setOpen(false)
    setNeedle('')
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
          selected
            ? 'border-brand-500 bg-brand-500/10 text-foreground'
            : 'border-border/70 text-muted-foreground hover:bg-accent/10 hover:text-foreground',
        )}
      >
        <span data-testid={`${testId}-value`}>
          {selected ? nameOf(selected) : t('palette.filterAnyone')}
        </span>
        <ChevronRight className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute left-0 z-50 mt-1 w-56 rounded-lg border border-border/70 bg-card p-1 shadow-xl"
            data-testid={`${testId}-menu`}
          >
            <div className="flex items-center gap-1.5 border-b border-border/60 px-2 pb-1.5">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground/70" />
              <input
                autoFocus
                value={needle}
                onChange={(e) => setNeedle(e.target.value)}
                placeholder={t('palette.searchPeople')}
                aria-label={t('palette.searchPeople')}
                data-testid={`${testId}-search`}
                /*
                 * cmdk owns keyboard navigation for the results list behind
                 * this menu, and it listens on the dialog. Without this, typing
                 * a name here also moved the highlighted search result, and
                 * Enter opened whatever it had landed on.
                 */
                onKeyDown={(e) => e.stopPropagation()}
                className="h-7 w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="max-h-56 overflow-y-auto pt-1">
              <button
                type="button"
                data-testid={`${testId}-anyone`}
                onClick={() => choose('')}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]',
                  value === '' ? 'text-foreground' : 'text-muted-foreground',
                  'hover:bg-accent/10 hover:text-foreground',
                )}
              >
                {t('palette.filterAnyone')}
              </button>
              {shown.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  data-testid={`${testId}-option-${m.userId}`}
                  onClick={() => choose(m.userId)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]',
                    value === m.userId ? 'text-foreground' : 'text-muted-foreground',
                    'hover:bg-accent/10 hover:text-foreground',
                  )}
                >
                  <PersonAvatar name={nameOf(m)} size="xs" />
                  <span className="truncate">{nameOf(m)}</span>
                </button>
              ))}
              {shown.length === 0 && (
                <p
                  className="px-2 py-1.5 text-[11px] text-muted-foreground"
                  data-testid={`${testId}-empty`}
                >
                  {t('palette.noPeople')}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
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
