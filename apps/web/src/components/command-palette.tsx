import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Button, Card, Input } from '@rundesk/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

type SearchHit = { id: string; entityType: string; title: string; content: string; url: string }

function getWorkspaceIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'app') return null
  return parts[1] ?? null
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
  const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(open) : v
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceId = useMemo(() => getWorkspaceIdFromPath(location.pathname), [location.pathname])

  const searchQuery = useQuery({
    enabled: open && Boolean(workspaceId) && query.trim().length > 0,
    queryKey: ['search', workspaceId, query],
    queryFn: () => api<SearchHit[]>(`/search/${workspaceId}?q=${encodeURIComponent(query)}`),
  })

  const createTask = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !query.trim()) return
      // Quick create in first visible list of first project/space.
      const spaces = await api<Array<{ id: string }>>(`/spaces/workspace/${workspaceId}`)
      const projects = await api<Array<{ id: string }>>(`/projects/space/${spaces[0].id}`)
      const lists = await api<Array<{ id: string }>>(`/lists/project/${projects[0].id}`)
      return api(`/tasks`, {
        method: 'POST',
        body: JSON.stringify({ listId: lists[0].id, title: query.trim() }),
      })
    },
    onSuccess: () => setOpen(false),
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
      if (!open) return
      const totalItems = (searchQuery.data?.length ?? 0) + 1 // + Create action
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(totalItems, 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex === 0) {
          if (query.trim()) createTask.mutate()
          return
        }
        const hit = searchQuery.data?.[selectedIndex - 1]
        if (hit?.url?.startsWith('/app/')) {
          setOpen(false)
          navigate({ to: hit.url as '/app' })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, searchQuery.data, selectedIndex, query, createTask, navigate])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-label="close command palette" />
      <Card className="absolute left-1/2 top-24 w-[92vw] max-w-2xl -translate-x-1/2 p-3">
        <Input
          autoFocus
          placeholder="Search docs, tasks, or type task title then press Create..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant={selectedIndex === 0 ? 'default' : 'outline'}
            onClick={() => createTask.mutate()}
            disabled={!query.trim() || createTask.isPending}
          >
            Create Task
          </Button>
        </div>
        <div className="mt-3 max-h-80 overflow-auto space-y-2">
          {searchQuery.data?.map((hit, idx) => (
            <button
              key={hit.id}
              className={`w-full text-left rounded border border-border p-2 hover:bg-muted ${selectedIndex === idx + 1 ? 'bg-muted' : ''}`}
              onClick={() => {
                setOpen(false)
                if (hit.url.startsWith('/app/')) {
                  navigate({ to: hit.url as '/app' })
                }
              }}
            >
              <div className="text-xs text-muted-foreground uppercase">{hit.entityType}</div>
              <div className="font-medium">{hit.title}</div>
              <div className="text-sm text-muted-foreground line-clamp-1">{hit.content}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
