import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Badge, cn, toast } from '@rundesk/ui'
import {
  Circle as CircleIcon,
  Diamond,
  Frame,
  Grid3x3,
  Hexagon,
  MoveDiagonal,
  MoveDown,
  MoveUp,
  Plus,
  Square,
  StickyNote,
  Trash2,
  Triangle,
  Type,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'
import { CursorLayer, useCanvasCursors } from '../lib/use-canvas-cursors'

type Whiteboard = {
  id: string
  title: string
  updatedAt?: string
  data?: {
    items?: BoardItem[]
  }
}

type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon'

type BoardItem = {
  id: string
  type: 'note' | 'shape' | 'text'
  shape?: ShapeKind
  x: number
  y: number
  w: number
  h: number
  z?: number
  content: string
  color?: string
}

const GRID_SIZE = 20
const PALETTE = [
  '#fde68a', // amber
  '#bfdbfe', // blue
  '#bbf7d0', // green
  '#fecaca', // red
  '#ddd6fe', // violet
  '#fbcfe8', // pink
  '#e5e7eb', // gray
]

function snap(value: number, enabled: boolean) {
  if (!enabled) return value
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

export function WhiteboardsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/whiteboards' })
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [items, setItems] = useState<BoardItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [snapEnabled, setSnapEnabled] = useState(true)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { remoteCursors, onPointerMove, onPointerLeave } = useCanvasCursors(
    activeBoardId,
    canvasRef,
  )

  const boardsQuery = useQuery({
    queryKey: ['workspace-canvases', workspaceId, 'whiteboard'],
    queryFn: () => api<Whiteboard[]>(`/workspaces/${workspaceId}/canvases?type=whiteboard`),
  })
  const createBoard = useMutation({
    mutationFn: (title: string) =>
      api<Whiteboard>(`/workspaces/${workspaceId}/canvases`, {
        method: 'POST',
        body: { type: 'whiteboard', title, data: { items: [] as BoardItem[] } },
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'whiteboard'] })
      setActiveBoardId(created.id)
      setItems([])
    },
  })

  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data])
  const filtered = useMemo(
    () => boards.filter((b) => b.title.toLowerCase().includes(query.toLowerCase())),
    [query, boards],
  )
  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  )

  const activeBoardRef = useRef(activeBoard)
  activeBoardRef.current = activeBoard

  const updateBoard = useMutation({
    mutationFn: (payload: {
      id: string
      title?: string
      data?: unknown
      expectedUpdatedAt?: string | null
    }) =>
      api<Whiteboard>(`/workspaces/${workspaceId}/canvases/${payload.id}`, {
        method: 'PATCH',
        body: {
          title: payload.title,
          data: payload.data,
          ...(payload.expectedUpdatedAt != null && payload.expectedUpdatedAt !== ''
            ? { expectedUpdatedAt: payload.expectedUpdatedAt }
            : {}),
        },
      }),
    onSuccess: (row) => {
      qc.setQueryData<Whiteboard[] | undefined>(
        ['workspace-canvases', workspaceId, 'whiteboard'],
        (prev) => prev?.map((b) => (b.id === row.id ? { ...b, ...row } : b)) ?? prev,
      )
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast('Board version conflict', {
          id: 'whiteboard-canvas-conflict',
          description: 'Latest version was loaded. Please apply your change again.',
        })
      }
      await qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'whiteboard'] })
    },
  })

  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      setActiveBoardId(boards[0].id)
    }
  }, [activeBoardId, boards])

  useEffect(() => {
    if (!activeBoard) return
    const next = activeBoard.data?.items
    if (Array.isArray(next)) setItems(next)
    else setItems([])
    setSelectedIds([])
  }, [activeBoard])

  useEffect(() => {
    if (!activeBoardId) return
    const timer = window.setTimeout(() => {
      const board = activeBoardRef.current
      const expected =
        board && board.id === activeBoardId ? (board.updatedAt ?? undefined) : undefined
      updateBoard.mutate({
        id: activeBoardId,
        data: { items },
        expectedUpdatedAt: expected,
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeBoardId, items, updateBoard])

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

  // Keyboard shortcuts: Delete = remove selected; Cmd+D = duplicate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedIds.length === 0) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        setItems((prev) => prev.filter((p) => !selectedIds.includes(p.id)))
        setSelectedIds([])
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const copies = items
          .filter((it) => selectedIds.includes(it.id))
          .map((it) => ({ ...it, id: `${it.type}-${crypto.randomUUID()}`, x: it.x + 20, y: it.y + 20 }))
        setItems((prev) => [...prev, ...copies])
        setSelectedIds(copies.map((c) => c.id))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, items])

  function addItem(type: BoardItem['type'], shape?: ShapeKind) {
    const id = `${shape ?? type}-${crypto.randomUUID()}`
    setItems((prev) => [
      ...prev,
      {
        id,
        type,
        shape,
        x: snap(120 + prev.length * 24, snapEnabled),
        y: snap(120 + prev.length * 18, snapEnabled),
        w: type === 'text' ? 180 : 190,
        h: type === 'shape' ? 110 : 120,
        z: (prev[prev.length - 1]?.z ?? 0) + 1,
        content: type === 'note' ? 'New note' : type === 'shape' ? '' : 'Heading',
        color: type === 'note' ? '#fde68a' : type === 'shape' ? '#bfdbfe' : '#e9d5ff',
      },
    ])
    setSelectedIds([id])
  }

  const selectedItem = items.find((it) => selectedIds.length === 1 && it.id === selectedIds[0]) ?? null

  const setItemColor = (color: string) => {
    if (selectedIds.length === 0) return
    setItems((prev) => prev.map((p) => (selectedIds.includes(p.id) ? { ...p, color } : p)))
  }

  const bringToFront = () => {
    if (selectedIds.length === 0) return
    const maxZ = Math.max(0, ...items.map((p) => p.z ?? 0))
    setItems((prev) =>
      prev.map((p) =>
        selectedIds.includes(p.id) ? { ...p, z: maxZ + 1 } : p,
      ),
    )
  }
  const sendToBack = () => {
    if (selectedIds.length === 0) return
    const minZ = Math.min(0, ...items.map((p) => p.z ?? 0))
    setItems((prev) =>
      prev.map((p) =>
        selectedIds.includes(p.id) ? { ...p, z: minZ - 1 } : p,
      ),
    )
  }

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    [items],
  )

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
          <p className="text-sm text-muted-foreground mt-1">
            Drag, resize, multi-select. Snap-to-grid when enabled. <kbd className="rounded border px-1 text-[10px]">Del</kbd> removes, <kbd className="rounded border px-1 text-[10px]">⌘D</kbd> duplicates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="gradient"
            onClick={() => createBoard.mutate(`Whiteboard ${new Date().toLocaleString()}`)}
          >
            <Plus className="h-4 w-4" /> New board
          </Button>
          <Button
            size="sm"
            variant={snapEnabled ? 'secondary' : 'outline'}
            onClick={() => setSnapEnabled((v) => !v)}
            title="Toggle snap-to-grid"
          >
            <Grid3x3 className="h-4 w-4" /> {snapEnabled ? 'Snap on' : 'Snap off'}
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <Card className="p-2 flex flex-wrap items-center gap-1.5 bg-card/40">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">Add</span>
        <Button size="sm" variant="ghost" onClick={() => addItem('note')}>
          <StickyNote className="h-4 w-4" /> Note
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addItem('text')}>
          <Type className="h-4 w-4" /> Text
        </Button>
        <span className="mx-1 h-5 w-px bg-border/60" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">Shapes</span>
        <Button size="sm" variant="ghost" onClick={() => addItem('shape', 'rect')}>
          <Square className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addItem('shape', 'ellipse')}>
          <CircleIcon className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addItem('shape', 'diamond')}>
          <Diamond className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addItem('shape', 'triangle')}>
          <Triangle className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addItem('shape', 'hexagon')}>
          <Hexagon className="h-4 w-4" />
        </Button>

        {selectedIds.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-border/60" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2">
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-1 px-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={cn(
                    'h-5 w-5 rounded-full border border-border/60 transition-transform hover:scale-110',
                    selectedItem?.color === c && 'ring-2 ring-brand-500',
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setItemColor(c)}
                  aria-label={`Set color ${c}`}
                />
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={bringToFront} title="Bring to front">
              <MoveUp className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={sendToBack} title="Send to back">
              <MoveDown className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setItems((prev) => prev.filter((p) => !selectedIds.includes(p.id)))
                setSelectedIds([])
              }}
              title="Delete (Del)"
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </>
        )}
      </Card>

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
                setSelectedIds([])
              }}
            >
              {b.title}
            </button>
          ))}
        </Card>
        <Card
          ref={canvasRef}
          className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:22px_22px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedIds([])
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <CursorLayer cursors={remoteCursors} />
          {sortedItems.map((item) => (
            <DraggableItem
              key={item.id}
              item={item}
              selected={selectedIds.includes(item.id)}
              snapEnabled={snapEnabled}
              onSelect={(additive) => {
                setSelectedIds((prev) =>
                  additive
                    ? prev.includes(item.id)
                      ? prev.filter((id) => id !== item.id)
                      : [...prev, item.id]
                    : [item.id],
                )
              }}
              onTranslate={(dx, dy) => {
                setItems((prev) =>
                  prev.map((p) =>
                    selectedIds.includes(p.id)
                      ? { ...p, x: snap(p.x + dx, snapEnabled), y: snap(p.y + dy, snapEnabled) }
                      : p,
                  ),
                )
              }}
              onResize={(w, h) => {
                setItems((prev) =>
                  prev.map((p) =>
                    p.id === item.id ? { ...p, w: snap(w, snapEnabled), h: snap(h, snapEnabled) } : p,
                  ),
                )
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
}

function DraggableItem({
  item,
  selected,
  snapEnabled,
  onSelect,
  onTranslate,
  onResize,
  onContentChange,
}: {
  item: BoardItem
  selected: boolean
  snapEnabled: boolean
  onSelect: (additive: boolean) => void
  onTranslate: (dx: number, dy: number) => void
  onResize: (w: number, h: number) => void
  onContentChange: (value: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const beginDrag = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.handle === 'resize') return
      onSelect(e.shiftKey)
      setDragging(true)
      let lastX = e.clientX
      let lastY = e.clientY
      const onMoveMouse = (evt: MouseEvent) => {
        const dx = evt.clientX - lastX
        const dy = evt.clientY - lastY
        lastX = evt.clientX
        lastY = evt.clientY
        onTranslate(dx, dy)
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('mousemove', onMoveMouse)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMoveMouse)
      window.addEventListener('mouseup', onUp)
    },
    [onSelect, onTranslate],
  )

  const beginResize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const baseW = item.w
      const baseH = item.h
      const onMoveMouse = (evt: MouseEvent) => {
        onResize(Math.max(60, baseW + (evt.clientX - startX)), Math.max(40, baseH + (evt.clientY - startY)))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMoveMouse)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMoveMouse)
      window.addEventListener('mouseup', onUp)
    },
    [item.w, item.h, onResize],
  )

  // For non-rect shapes, render an inner clipping element.
  const shapeStyles = shapeFor(item)

  return (
    <div
      className={cn(
        'absolute group',
        selected && 'ring-2 ring-brand-500',
        dragging && 'cursor-grabbing',
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.w,
        height: item.h,
        zIndex: item.z ?? 0,
        ...shapeStyles.outer,
      }}
      onMouseDown={beginDrag}
    >
      <div
        className="absolute inset-0 rounded-lg shadow-card"
        style={{ backgroundColor: item.color ?? '#bfdbfe', ...shapeStyles.inner }}
      />
      <textarea
        value={item.content}
        onChange={(e) => onContentChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'relative w-full h-full resize-none bg-transparent p-2 text-sm outline-none',
          item.type === 'text' && 'font-medium',
        )}
      />
      {selected && (
        <button
          type="button"
          data-handle="resize"
          onMouseDown={beginResize}
          className="absolute -right-1.5 -bottom-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-brand-500 bg-card shadow"
          aria-label="Resize"
        >
          <MoveDiagonal className="h-3 w-3 m-0.5 text-brand-500" />
        </button>
      )}
      {snapEnabled && selected && dragging && (
        <div className="pointer-events-none absolute -top-5 left-0 text-[10px] text-muted-foreground tabular-nums">
          {Math.round(item.x)}, {Math.round(item.y)}
        </div>
      )}
    </div>
  )
}

/**
 * For non-rect shapes we use CSS clip-path so resize/drag works uniformly.
 * Triangle / diamond / hexagon get clipped from a normal div.
 */
function shapeFor(item: BoardItem): { outer: React.CSSProperties; inner: React.CSSProperties } {
  if (item.type !== 'shape' || !item.shape || item.shape === 'rect') {
    return { outer: {}, inner: {} }
  }
  const clip = {
    ellipse: { borderRadius: '9999px' },
    diamond: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
    triangle: { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' },
    hexagon: {
      clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
    },
  }[item.shape] as React.CSSProperties
  return { outer: {}, inner: clip }
}
