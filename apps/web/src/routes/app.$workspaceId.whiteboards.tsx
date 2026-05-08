import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Badge, cn, toast } from '@rundesk/ui'
import { Frame, Plus, Square, StickyNote, Type } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'

export const Route = createFileRoute('/app/$workspaceId/whiteboards')({
  component: WhiteboardsPage,
})

type Whiteboard = {
  id: string
  title: string
  updatedAt?: string
  data?: {
    items?: BoardItem[]
  }
}
type BoardItem = {
  id: string
  type: 'note' | 'shape' | 'text'
  x: number
  y: number
  w: number
  h: number
  content: string
  color?: string
}

function WhiteboardsPage() {
  const { workspaceId } = Route.useParams()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [items, setItems] = useState<BoardItem[]>([
    { id: 'n1', type: 'note', x: 80, y: 110, w: 180, h: 120, content: 'Launch checklist', color: '#fde68a' },
    { id: 'n2', type: 'shape', x: 380, y: 180, w: 190, h: 90, content: 'API sync', color: '#bfdbfe' },
    { id: 'n3', type: 'text', x: 660, y: 120, w: 170, h: 48, content: 'Customer journey', color: '#ddd6fe' },
  ])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const boardsQuery = useQuery({
    queryKey: ['workspace-canvases', workspaceId, 'whiteboard'],
    queryFn: () => api<Whiteboard[]>(`/workspaces/${workspaceId}/canvases?type=whiteboard`),
  })
  const createBoard = useMutation({
    mutationFn: (title: string) =>
      api<Whiteboard>(`/workspaces/${workspaceId}/canvases`, {
        method: 'POST',
        body: {
          type: 'whiteboard',
          title,
          data: { items: [] as BoardItem[] },
        },
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'whiteboard'] })
      setActiveBoardId(created.id)
      setItems([])
    },
  })
  const updateBoard = useMutation({
    mutationFn: (payload: { id: string; title?: string; data?: unknown }) =>
      api(`/workspaces/${workspaceId}/canvases/${payload.id}`, {
        method: 'PATCH',
        body: {
          title: payload.title,
          data: payload.data,
          expectedUpdatedAt: activeBoard?.updatedAt,
        },
      }),
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast('Board updated by teammate', {
          description: 'Latest version was loaded. Please apply your change again.',
        })
      }
      await qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'whiteboard'] })
    },
  })
  const boards = boardsQuery.data ?? []
  const filtered = useMemo(
    () => boards.filter((b) => b.title.toLowerCase().includes(query.toLowerCase())),
    [query, boards],
  )
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null

  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      setActiveBoardId(boards[0].id)
    }
  }, [activeBoardId, boards])

  useEffect(() => {
    if (!activeBoard) return
    const next = activeBoard.data?.items
    if (Array.isArray(next)) {
      setItems(next)
    } else {
      setItems([])
    }
  }, [activeBoard?.id])

  useEffect(() => {
    if (!activeBoardId) return
    const timer = window.setTimeout(() => {
      updateBoard.mutate({
        id: activeBoardId,
        data: { items },
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeBoardId, items])

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`workspace:${workspaceId}`] })
    const onEvent = (event: {
      type: string
      workspaceId?: string
      canvas?: Whiteboard
      canvasId?: string
      patch?: Partial<Whiteboard>
      actorId?: string
    }) => {
      if (event.workspaceId !== workspaceId) return
      if (event.actorId && event.actorId === me?.id) return
      if (event.type === 'canvas.created' && event.canvas?.id) {
        qc.setQueryData<Whiteboard[] | undefined>(
          ['workspace-canvases', workspaceId, 'whiteboard'],
          (prev) => {
            if (!prev) return [event.canvas!]
            if (prev.some((b) => b.id === event.canvas!.id)) return prev
            return [event.canvas!, ...prev]
          },
        )
      }
      if (event.type === 'canvas.updated' && event.canvasId) {
        qc.setQueryData<Whiteboard[] | undefined>(
          ['workspace-canvases', workspaceId, 'whiteboard'],
          (prev) =>
            prev?.map((b) => (b.id === event.canvasId ? { ...b, ...(event.patch ?? {}) } : b)) ?? prev,
        )
      }
      if (event.type === 'canvas.deleted' && event.canvasId) {
        qc.setQueryData<Whiteboard[] | undefined>(
          ['workspace-canvases', workspaceId, 'whiteboard'],
          (prev) => prev?.filter((b) => b.id !== event.canvasId) ?? prev,
        )
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [workspaceId, qc, me?.id])

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Frame className="h-4 w-4" />
            </span>
            Whiteboards
            <Badge variant="secondary" className="ml-1">Live</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Interactive canvas with draggable items.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="gradient"
            onClick={() => createBoard.mutate(`Whiteboard ${new Date().toLocaleString()}`)}
          >
            <Plus className="h-4 w-4" /> New board
          </Button>
          <Button size="sm" variant="outline" onClick={() => addItem('note')}><StickyNote className="h-4 w-4" /> Note</Button>
          <Button size="sm" variant="outline" onClick={() => addItem('shape')}><Square className="h-4 w-4" /> Shape</Button>
          <Button size="sm" variant="outline" onClick={() => addItem('text')}><Type className="h-4 w-4" /> Text</Button>
        </div>
      </header>
      <div className="flex items-center gap-2 max-w-md">
        <Input
          placeholder="Search boards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex gap-3 min-h-0 flex-1">
        <Card className="w-72 p-2 space-y-1 overflow-auto">
          {boardsQuery.isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading boards...</div>
          ) : null}
          {filtered.map((b) => (
            <button
              key={b.id}
              className={cn(
                'w-full text-left rounded px-3 py-2 text-sm',
                b.id === activeBoardId ? 'bg-accent/15 text-foreground' : 'hover:bg-card/60 text-muted-foreground',
              )}
              onClick={() => {
                setActiveBoardId(b.id)
                setSelectedId(null)
              }}
            >
              {b.title}
            </button>
          ))}
        </Card>
        <Card className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:22px_22px]">
          <svg className="absolute inset-0 pointer-events-none">
            {items.map((item, i) => {
              if (i === 0) return null
              const prev = items[i - 1]
              return <line key={`${prev.id}-${item.id}`} x1={prev.x + prev.w / 2} y1={prev.y + prev.h / 2} x2={item.x + item.w / 2} y2={item.y + item.h / 2} stroke="hsl(var(--border))" strokeWidth="2" />
            })}
          </svg>
          {items.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onMove={(x, y) => {
                setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, x, y } : p)))
              }}
              onContentChange={(content) => {
                setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, content } : p)))
              }}
            />
          ))}
        </Card>
      </div>
    </div>
  )
  function addItem(type: BoardItem['type']) {
    const id = `${type}-${Date.now()}`
    setItems((prev) => [
      ...prev,
      {
        id,
        type,
        x: 120 + prev.length * 24,
        y: 120 + prev.length * 18,
        w: type === 'text' ? 180 : 190,
        h: type === 'shape' ? 90 : 120,
        content: type === 'note' ? 'New note' : type === 'shape' ? 'Process step' : 'Heading',
        color: type === 'note' ? '#fde68a' : type === 'shape' ? '#bfdbfe' : '#e9d5ff',
      },
    ])
  }
}

function DraggableItem({
  item,
  selected,
  onSelect,
  onMove,
  onContentChange,
}: {
  item: BoardItem
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onContentChange: (value: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={cn(
        'absolute rounded-lg border shadow-card',
        selected && 'ring-2 ring-brand-500',
        dragging && 'cursor-grabbing',
      )}
      style={{ left: item.x, top: item.y, width: item.w, minHeight: item.h, backgroundColor: item.color }}
      onMouseDown={(e) => {
        onSelect()
        setDragging(true)
        const startX = e.clientX
        const startY = e.clientY
        const baseX = item.x
        const baseY = item.y
        const onMoveMouse = (evt: MouseEvent) => {
          onMove(baseX + evt.clientX - startX, baseY + evt.clientY - startY)
        }
        const onUp = () => {
          setDragging(false)
          window.removeEventListener('mousemove', onMoveMouse)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMoveMouse)
        window.addEventListener('mouseup', onUp)
      }}
    >
      <textarea
        value={item.content}
        onChange={(e) => onContentChange(e.target.value)}
        className="w-full h-full min-h-[70px] resize-none bg-transparent p-2 text-sm outline-none"
      />
    </div>
  )
}
