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
} from '@rundesk/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
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
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'

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
}

export function CommandPalette({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceId = useMemo(
    () => getWorkspaceIdFromPath(location.pathname),
    [location.pathname],
  )

  const searchQuery = useQuery({
    enabled: open && Boolean(workspaceId) && query.trim().length > 0,
    queryKey: ['search', workspaceId, query],
    queryFn: () =>
      api<SearchHit[]>(`/search/${workspaceId}?q=${encodeURIComponent(query)}`),
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
        { icon: LayoutDashboard, label: 'Dashboard', to: `/app/${workspaceId}/dashboard` },
        { icon: GanttChart, label: 'Timeline', to: `/app/${workspaceId}/timeline` },
        { icon: Inbox, label: 'Inbox', to: `/app/${workspaceId}/inbox` },
        { icon: MessageSquare, label: 'Chat', to: `/app/${workspaceId}/chat` },
        { icon: FileText, label: 'Docs', to: `/app/${workspaceId}/docs` },
        { icon: Target, label: 'Goals', to: `/app/${workspaceId}/goals` },
        { icon: Sparkles, label: 'AI', to: `/app/${workspaceId}/ai` },
        { icon: Zap, label: 'Automations', to: `/app/${workspaceId}/automations` },
        { icon: Settings, label: 'Settings', to: `/app/${workspaceId}/settings` },
      ]
    : []

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search tasks, docs, people…  or type to create"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.trim() ? (
            <span>
              No matches — try a different keyword, or press <CommandShortcut>↵</CommandShortcut> to create a task.
            </span>
          ) : (
            <span>Start typing to search across your workspace.</span>
          )}
        </CommandEmpty>

        {/* Quick action — create task from query */}
        {query.trim() && workspaceId && (
          <CommandGroup heading="Quick actions">
            <CommandItem onSelect={() => createTask.mutate()} value={`__create__${query}`}>
              <Plus className="text-accent" />
              Create task <span className="font-medium text-foreground">&quot;{query.trim()}&quot;</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search results */}
        {searchQuery.data && searchQuery.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Results">
              {searchQuery.data.map((hit) => {
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
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {hit.entityType}
                    </span>
                    <ArrowRight className="text-muted-foreground" />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}

        {/* Navigation shortcuts */}
        {!query.trim() && navTargets.length > 0 && (
          <CommandGroup heading="Jump to">
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
