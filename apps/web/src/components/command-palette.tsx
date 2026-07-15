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
  ArrowRight,
  CheckCircle2,
  FileText,
  Folder,
  GanttChart,
  Inbox,
  LayoutDashboard,
  List as ListIcon,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type SearchHit = { id: string; entityType: string; title: string; content: string; url: string }

function getWorkspaceIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'app') return null
  return parts[1] ?? null
}

const ENTITY_ICON: Record<string, React.ElementType> = {
  task: CheckCircle2,
  doc: FileText,
  project: Folder,
  list: ListIcon,
  channel: MessageSquare,
  message: MessageSquare,
  comment: MessageSquare,
  user: Users,
}
const ENTITY_ORDER = ['task', 'doc', 'comment', 'channel', 'message', 'user']
const ENTITY_LABEL: Record<string, string> = {
  task: 'Tasks',
  doc: 'Docs',
  comment: 'Comments',
  channel: 'Channels',
  message: 'Messages',
  user: 'People',
}

export function CommandPalette({
  open: openProp,
  onOpenChange,
  initialQuery = '',
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialQuery?: string
} = {}) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }
  const [query, setQuery] = useState(initialQuery)
  const [typeFilter, setTypeFilter] = useState<'all' | 'task' | 'doc'>('all')
  const [statusFilter, setStatusFilter] = useState<'' | 'open' | 'in_progress' | 'closed'>('')
  const [priorityFilter, setPriorityFilter] = useState<'' | 'urgent' | 'high' | 'normal' | 'low'>('')
  const [labelFilter, setLabelFilter] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [dueAfter, setDueAfter] = useState<string>('')
  const [dueBefore, setDueBefore] = useState<string>('')

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

  type SavedSearch = { id: string; name: string; query: string | null; filters: Record<string, unknown> }
  const savedQuery = useQuery({
    enabled: open && Boolean(workspaceId),
    queryKey: ['saved-searches', workspaceId],
    queryFn: () => api<SavedSearch[]>(`/search/${workspaceId}/saved`),
  })
  const applyPreset = (s: SavedSearch) => {
    const f = s.filters ?? {}
    setQuery(s.query ?? '')
    setTypeFilter((f.types as string[])?.length === 1 ? ((f.types as string[])[0] as 'task' | 'doc') : 'all')
    setStatusFilter((f.statusCategory as any) ?? '')
    setPriorityFilter((f.priority as any) ?? '')
    setLabelFilter((f.labelId as string) ?? '')
    setAssigneeFilter((f.assigneeId as string) ?? '')
    setDueAfter((f.dueAfter as string) ?? '')
    setDueBefore((f.dueBefore as string) ?? '')
  }
  const saveCurrent = useMutation({
    mutationFn: (name: string) => {
      const filters: Record<string, unknown> = {}
      if (typeFilter !== 'all') filters.types = [typeFilter]
      if (statusFilter) filters.statusCategory = statusFilter
      if (priorityFilter) filters.priority = priorityFilter
      if (labelFilter) filters.labelId = labelFilter
      if (assigneeFilter) filters.assigneeId = assigneeFilter
      if (dueAfter) filters.dueAfter = dueAfter
      if (dueBefore) filters.dueBefore = dueBefore
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

  const hasFilter =
    typeFilter !== 'all' || statusFilter !== '' || priorityFilter !== '' || labelFilter !== '' ||
    assigneeFilter !== '' || dueAfter !== '' || dueBefore !== ''
  const searchQuery = useQuery({
    enabled: open && Boolean(workspaceId) && (query.trim().length > 0 || hasFilter),
    queryKey: ['search', workspaceId, query, typeFilter, statusFilter, priorityFilter, labelFilter, assigneeFilter, dueAfter, dueBefore],
    queryFn: () => {
      const params = new URLSearchParams({ q: query })
      if (typeFilter !== 'all') params.set('types', typeFilter)
      if (statusFilter) params.set('statusCategory', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      if (labelFilter) params.set('labelId', labelFilter)
      if (assigneeFilter) params.set('assigneeId', assigneeFilter)
      if (dueAfter) params.set('dueAfter', dueAfter)
      if (dueBefore) params.set('dueBefore', dueBefore)
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
        { icon: MessageSquare, label: t('nav.chat'), to: `/app/${workspaceId}/chat` },
        { icon: FileText, label: t('nav.docs'), to: `/app/${workspaceId}/docs` },
        { icon: Target, label: t('nav.goals'), to: `/app/${workspaceId}/goals` },
        { icon: Sparkles, label: t('nav.ai'), to: `/app/${workspaceId}/ai` },
        { icon: Zap, label: t('nav.automations'), to: `/app/${workspaceId}/automations` },
        { icon: Settings, label: t('nav.settings'), to: `/app/${workspaceId}/settings` },
      ]
    : []

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t('palette.searchPlaceholder')}
        value={query}
        onValueChange={setQuery}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b border-border/60">
        <FilterGroup label="Type">
          {(['all', 'task', 'doc'] as const).map((v) => (
            <FilterChip key={v} active={typeFilter === v} onClick={() => setTypeFilter(v)}>
              {v === 'all' ? 'All' : v === 'task' ? 'Tasks' : 'Docs'}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Status">
          {(['open', 'in_progress', 'closed'] as const).map((v) => (
            <FilterChip
              key={v}
              active={statusFilter === v}
              onClick={() => setStatusFilter((cur) => (cur === v ? '' : v))}
            >
              {v === 'open' ? 'To do' : v === 'in_progress' ? 'Active' : 'Closed'}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Priority">
          {(['urgent', 'high', 'normal', 'low'] as const).map((v) => (
            <FilterChip
              key={v}
              active={priorityFilter === v}
              onClick={() => setPriorityFilter((cur) => (cur === v ? '' : v))}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterChip>
          ))}
        </FilterGroup>
        {(labelsQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label="Label">
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
        {(membersQuery.data?.length ?? 0) > 0 && (
          <FilterGroup label="Assignee">
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
        <FilterGroup label="Due">
          <input
            type="date"
            value={dueAfter}
            onChange={(e) => setDueAfter(e.target.value)}
            title="Due after"
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
          <span className="text-[11px] text-muted-foreground/60">→</span>
          <input
            type="date"
            value={dueBefore}
            onChange={(e) => setDueBefore(e.target.value)}
            title="Due before"
            className="h-6 rounded-md border border-border/70 bg-transparent px-1 text-[11px] text-muted-foreground"
          />
        </FilterGroup>
      </div>
      {(((savedQuery.data?.length ?? 0) > 0) || hasFilter || query.trim()) && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 -mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mr-0.5">
            Presets
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
                aria-label={`Delete ${s.name}`}
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
                const name = window.prompt('Save this search as…')?.trim()
                if (name) saveCurrent.mutate(name)
              }}
              className="rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/10"
            >
              + Save current
            </button>
          )}
        </div>
      )}
      <CommandList>
        <CommandEmpty>
          {query.trim() ? (
            <span>
              No matches — try a different keyword, or press <CommandShortcut>↵</CommandShortcut> to create a task.
            </span>
          ) : hasFilter ? (
            <span>No items match the selected filters.</span>
          ) : (
            <span>Start typing to search, or pick a filter above.</span>
          )}
        </CommandEmpty>

        {/* Quick action — create task from query */}
        {query.trim() && workspaceId && (
          <CommandGroup heading={t('palette.quickActions')}>
            <CommandItem onSelect={() => createTask.mutate()} value={`__create__${query}`}>
              <Plus className="text-accent" />
              {t('palette.createTask')} <span className="font-medium text-foreground">&quot;{query.trim()}&quot;</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search results */}
        {searchQuery.data && searchQuery.data.length > 0 && (
          <>
            <CommandSeparator />
            {/* Results grouped by entity type (§11.1) */}
            {ENTITY_ORDER.filter((t) => searchQuery.data!.some((h) => h.entityType === t)).map((type) => (
              <CommandGroup key={type} heading={ENTITY_LABEL[type] ?? type}>
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
        {!query.trim() && navTargets.length > 0 && (
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
