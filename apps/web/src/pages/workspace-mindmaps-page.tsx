import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Input,
  Badge,
  cn,
  toast,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { getRealtimeSocket } from '../lib/realtime'
import { useAuthStore } from '../store/auth'
import { CursorLayer, useCanvasCursors } from '../lib/use-canvas-cursors'
import {
  Plus,
  Network,
  GitBranchPlus,
  Palette,
  Sparkles,
  Trash2,
} from 'lucide-react'

type MindMap = {
  id: string
  title: string
  updatedAt?: string
  data?: {
    nodes?: MapNode[]
  }
}
type MapNode = {
  id: string
  label: string
  x: number
  y: number
  parentId?: string
  /** Optional accent colour for the branch chip. */
  color?: string
}

const BRANCH_PALETTE = [
  '#60a5fa', // blue
  '#34d399', // green
  '#fbbf24', // amber
  '#f472b6', // pink
  '#a78bfa', // violet
  '#f87171', // red
]

export function MindMapsPage() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId/mindmaps' })
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  /** Editor target; map row (incl. updatedAt) always comes from React Query so PATCH versioning stays correct. */
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [nodes, setNodes] = useState<MapNode[]>([
    { id: 'root', label: 'Root Topic', x: 520, y: 260 },
    { id: 'n-1', label: 'Goals', x: 320, y: 170, parentId: 'root' },
    { id: 'n-2', label: 'Risks', x: 710, y: 180, parentId: 'root' },
    { id: 'n-3', label: 'Ideas', x: 690, y: 360, parentId: 'root' },
  ])
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root')
  const [draftLabel, setDraftLabel] = useState('')
  const mapsQuery = useQuery({
    queryKey: ['workspace-canvases', workspaceId, 'mindmap'],
    queryFn: () => api<MindMap[]>(`/workspaces/${workspaceId}/canvases?type=mindmap`),
  })
  const maps = mapsQuery.data ?? []
  const active = useMemo(
    () => (activeMapId ? maps.find((m) => m.id === activeMapId) ?? null : null),
    [maps, activeMapId],
  )
  const activeRef = useRef(active)
  activeRef.current = active
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const createMap = useMutation({
    mutationFn: (title: string) =>
      api<MindMap>(`/workspaces/${workspaceId}/canvases`, {
        method: 'POST',
        body: {
          type: 'mindmap',
          title,
          data: { nodes: [{ id: 'root', label: 'Root Topic', x: 520, y: 260 }] as MapNode[] },
        },
      }),
    onSuccess: (created) => {
      qc.setQueryData<MindMap[] | undefined>(
        ['workspace-canvases', workspaceId, 'mindmap'],
        (prev) => {
          if (!prev) return [created]
          if (prev.some((m) => m.id === created.id)) {
            return prev.map((m) => (m.id === created.id ? created : m))
          }
          return [created, ...prev]
        },
      )
      void qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'mindmap'] })
      setActiveMapId(created.id)
      setNodes(created.data?.nodes ?? [{ id: 'root', label: 'Root Topic', x: 520, y: 260 }])
      setSelectedNodeId('root')
      setDraftLabel('Root Topic')
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast('Could not create mind map', { description: error.message })
        return
      }
      toast('Could not create mind map', { description: 'Something went wrong' })
    },
  })
  const updateMap = useMutation({
    mutationFn: (payload: {
      id: string
      title?: string
      data?: unknown
      expectedUpdatedAt?: string | null
    }) =>
      api<MindMap>(`/workspaces/${workspaceId}/canvases/${payload.id}`, {
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
      qc.setQueryData<MindMap[] | undefined>(
        ['workspace-canvases', workspaceId, 'mindmap'],
        (prev) => prev?.map((m) => (m.id === row.id ? { ...m, ...row } : m)) ?? prev,
      )
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast('Mind map version conflict', {
          id: 'mindmap-canvas-conflict',
          description: 'Latest version was loaded. Please retry your last edit.',
        })
      }
      await qc.invalidateQueries({ queryKey: ['workspace-canvases', workspaceId, 'mindmap'] })
    },
  })
  const filtered = maps.filter((m) =>
    m.title.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    if (!active) return
    const latest = maps.find((m) => m.id === active.id)
    if (!latest) return
    const fromServer = latest.data?.nodes
    if (Array.isArray(fromServer) && fromServer.length > 0) {
      setNodes(fromServer)
      const selected = fromServer.find((n) => n.id === selectedNodeId)
      if (selected) setDraftLabel(selected.label)
      else {
        const root = fromServer[0]
        setSelectedNodeId(root.id)
        setDraftLabel(root.label)
      }
    }
  }, [active?.id, maps, selectedNodeId])

  useEffect(() => {
    if (!activeMapId) return
    const timer = window.setTimeout(() => {
      const row = activeRef.current
      if (!row || row.id !== activeMapId) return
      updateMap.mutate({
        id: activeMapId,
        data: { nodes: nodesRef.current },
        expectedUpdatedAt: row.updatedAt ?? undefined,
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeMapId, nodes, updateMap])

  useEffect(() => {
    const socket = getRealtimeSocket()
    socket.emit('subscribe', { rooms: [`workspace:${workspaceId}`] })
    const onEvent = (event: {
      type: string
      workspaceId?: string
      canvas?: MindMap
      canvasId?: string
      patch?: Partial<MindMap>
      actorId?: string
    }) => {
      if (event.workspaceId !== workspaceId) return
      if (event.actorId && event.actorId === me?.id) return
      if (event.type === 'canvas.created' && event.canvas?.id) {
        qc.setQueryData<MindMap[] | undefined>(
          ['workspace-canvases', workspaceId, 'mindmap'],
          (prev) => {
            if (!prev) return [event.canvas!]
            if (prev.some((m) => m.id === event.canvas!.id)) return prev
            return [event.canvas!, ...prev]
          },
        )
      }
      if (event.type === 'canvas.updated' && event.canvasId) {
        qc.setQueryData<MindMap[] | undefined>(
          ['workspace-canvases', workspaceId, 'mindmap'],
          (prev) =>
            prev?.map((m) => (m.id === event.canvasId ? { ...m, ...(event.patch ?? {}) } : m)) ?? prev,
        )
      }
      if (event.type === 'canvas.deleted' && event.canvasId) {
        qc.setQueryData<MindMap[] | undefined>(
          ['workspace-canvases', workspaceId, 'mindmap'],
          (prev) => prev?.filter((m) => m.id !== event.canvasId) ?? prev,
        )
      }
    }
    socket.on('event', onEvent)
    return () => {
      socket.off('event', onEvent)
    }
  }, [workspaceId, qc, me?.id])

  const flushMindMapSave = useCallback(async () => {
    const row = activeRef.current
    const id = activeMapId
    if (!row || !id || row.id !== id) return
    try {
      await updateMap.mutateAsync({
        id,
        data: { nodes: nodesRef.current },
        expectedUpdatedAt: row.updatedAt ?? undefined,
      })
    } catch {
      /* onError handles toast + invalidate */
    }
  }, [activeMapId, updateMap])

  if (activeMapId) {
    if (!active) {
      return (
        <div className="p-6 flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
          Loading map…
        </div>
      )
    }
    return (
      <MindMapEditor
        map={active}
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        draftLabel={draftLabel}
        onBack={() => {
          void flushMindMapSave().finally(() => setActiveMapId(null))
        }}
        onSelect={(id) => {
          setSelectedNodeId(id)
          const node = nodes.find((n) => n.id === id)
          setDraftLabel(node?.label ?? '')
        }}
        onMove={(id, x, y) => {
          setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)))
        }}
        onCreateChild={() => {
          setNodes((prev) => {
            const base = prev.find((n) => n.id === selectedNodeId)
            if (!base) return prev
            const id = `n-${crypto.randomUUID()}`
            const siblingCount = prev.filter((n) => n.parentId === base.id).length
            const inheritedColor =
              base.color ?? BRANCH_PALETTE[siblingCount % BRANCH_PALETTE.length]
            return [
              ...prev,
              {
                id,
                label: 'New branch',
                x: base.x + 160,
                y: base.y + 40,
                parentId: base.id,
                color: inheritedColor,
              },
            ]
          })
        }}
        onLabelChange={(value) => {
          setDraftLabel(value)
          setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? { ...n, label: value } : n)))
        }}
        onSetColor={(color) => {
          setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? { ...n, color } : n)))
        }}
        onDeleteSelected={() => {
          if (selectedNodeId === 'root') {
            toast('Root node cannot be deleted')
            return
          }
          setNodes((prev) => {
            const toRemove = new Set<string>()
            const stack = [selectedNodeId]
            while (stack.length > 0) {
              const id = stack.pop()!
              toRemove.add(id)
              for (const n of prev) if (n.parentId === id) stack.push(n.id)
            }
            const next = prev.filter((n) => !toRemove.has(n.id))
            const root = next.find((n) => n.id === 'root')
            queueMicrotask(() => {
              setSelectedNodeId('root')
              setDraftLabel(root?.label ?? '')
            })
            return next
          })
        }}
        onAutoLayout={() => {
          setNodes((prev) => radialLayout(prev))
        }}
      />
    )
  }

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Workspace mind maps
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
              <Network className="h-4 w-4" />
            </span>
            Mind maps
            <Badge variant="secondary" className="ml-1">Live</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Brainstorm at the speed of thought. Drop nodes, connect them.
          </p>
        </div>
        <Button
          variant="gradient"
          size="lg"
          onClick={() => createMap.mutate(`Mind map ${new Date().toLocaleString()}`)}
        >
          <Plus className="h-4 w-4" /> New mind map
        </Button>
      </header>

      <div className="flex items-center gap-2 max-w-sm">
        <Input
          placeholder="Search mind maps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {mapsQuery.isError ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5 max-w-2xl">
          <div className="font-medium text-destructive">Could not load mind maps</div>
          <p className="text-sm text-muted-foreground mt-2">
            {mapsQuery.error instanceof ApiError
              ? mapsQuery.error.message
              : 'Request failed'}
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => void mapsQuery.refetch()}>
            Retry
          </Button>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mapsQuery.isLoading ? (
          <Card className="p-4 text-sm text-muted-foreground">Loading maps...</Card>
        ) : null}
        {filtered.map((m) => (
          <Card
            key={m.id}
            variant="glass"
            className="cursor-pointer p-0 overflow-hidden transition-all hover:shadow-glow hover:border-accent/40"
            onClick={() => {
              setActiveMapId(m.id)
              const initialNodes = m.data?.nodes ?? [{ id: 'root', label: 'Root Topic', x: 520, y: 260 }]
              setNodes(initialNodes)
              const root = initialNodes[0]
              if (root) {
                setSelectedNodeId(root.id)
                setDraftLabel(root.label)
              }
            }}
          >
            <div className="relative h-40 bg-card/30 overflow-hidden">
              <MapPreview />
            </div>
            <div className="p-4">
              <div className="font-medium truncate">{m.title}</div>
              <div className="text-xs text-muted-foreground mt-2">Interactive map editor</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function MapPreview() {
  return (
    <svg viewBox="0 0 320 160" className="absolute inset-0 h-full w-full">
      <g stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" fill="none">
        <path d="M160 80 L60 40" />
        <path d="M160 80 L60 80" />
        <path d="M160 80 L60 120" />
        <path d="M160 80 L260 40" />
        <path d="M160 80 L260 80" />
        <path d="M160 80 L260 120" />
        <path d="M60 40 L20 30" />
        <path d="M60 40 L20 50" />
        <path d="M260 120 L300 110" />
        <path d="M260 120 L300 130" />
      </g>
      <circle cx="160" cy="80" r="16" fill="hsl(var(--brand-500))" />
      {/* Sub-nodes */}
      {[
        [60, 40],
        [60, 80],
        [60, 120],
        [260, 40],
        [260, 80],
        [260, 120],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="hsla(0,0%,100%,0.8)" />
      ))}
      {[
        [20, 30],
        [20, 50],
        [300, 110],
        [300, 130],
      ].map(([x, y], i) => (
        <circle key={`leaf-${i}`} cx={x} cy={y} r="5" fill="hsla(0,0%,100%,0.4)" />
      ))}
    </svg>
  )
}

function MindMapEditor({
  map,
  nodes,
  selectedNodeId,
  draftLabel,
  onBack,
  onSelect,
  onMove,
  onCreateChild,
  onLabelChange,
  onSetColor,
  onDeleteSelected,
  onAutoLayout,
}: {
  map: MindMap
  nodes: MapNode[]
  selectedNodeId: string
  draftLabel: string
  onBack: () => void
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onCreateChild: () => void
  onLabelChange: (value: string) => void
  onSetColor: (color: string | undefined) => void
  onDeleteSelected: () => void
  onAutoLayout: () => void
}) {
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { remoteCursors, onPointerMove, onPointerLeave } = useCanvasCursors(map.id, canvasRef)

  // Keyboard shortcuts: Delete = remove selected branch; Tab = add child
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onDeleteSelected()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        onCreateChild()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDeleteSelected, onCreateChild])

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← All maps
          </Button>
          <div>
            <div className="font-display font-semibold">{map.title}</div>
            <div className="text-xs text-muted-foreground">
              {nodes.length} nodes · <kbd className="rounded border px-1 text-[10px]">Tab</kbd> add child · <kbd className="rounded border px-1 text-[10px]">Del</kbd> remove
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draftLabel}
            onChange={(e) => onLabelChange(e.target.value)}
            className="w-56 h-8"
            placeholder="Node label"
          />
          <Button variant="outline" size="sm" onClick={onCreateChild}>
            <GitBranchPlus className="h-3.5 w-3.5" /> Add child
          </Button>
          <Button variant="outline" size="sm" onClick={onAutoLayout} title="Radial auto-layout">
            <Sparkles className="h-3.5 w-3.5" /> Auto-layout
          </Button>
          {selectedNodeId !== 'root' && (
            <Button variant="ghost" size="sm" onClick={onDeleteSelected} title="Delete branch (Del)">
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </Button>
          )}
        </div>
      </header>

      {selectedNode && selectedNodeId !== 'root' && (
        <div className="flex items-center gap-2 border-b border-border/40 px-6 py-2 bg-card/20">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Branch colour</span>
          <button
            onClick={() => onSetColor(undefined)}
            className={cn(
              'h-5 w-5 rounded-full border border-border/60 bg-card transition-transform hover:scale-110',
              !selectedNode.color && 'ring-2 ring-brand-500',
            )}
            aria-label="Reset colour"
          />
          {BRANCH_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => onSetColor(c)}
              className={cn(
                'h-5 w-5 rounded-full border border-border/60 transition-transform hover:scale-110',
                selectedNode.color === c && 'ring-2 ring-brand-500',
              )}
              style={{ backgroundColor: c }}
              aria-label={`Set colour ${c}`}
            />
          ))}
        </div>
      )}

      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden bg-card/20"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <BackgroundDots />
        <CursorLayer cursors={remoteCursors} />
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {nodes
            .filter((n) => n.parentId)
            .map((n) => {
              const parent = n.parentId ? nodesById[n.parentId] : null
              if (!parent) return null
              return (
                <path
                  key={`${parent.id}-${n.id}`}
                  d={`M ${parent.x} ${parent.y} Q ${(parent.x + n.x) / 2} ${parent.y} ${n.x} ${n.y}`}
                  stroke={n.color ?? 'hsl(var(--border))'}
                  strokeWidth="2"
                  fill="none"
                  opacity={n.color ? 0.6 : 1}
                />
              )
            })}
        </svg>
        {nodes.map((node) => (
          <MapNodeChip
            key={node.id}
            node={node}
            selected={selectedNodeId === node.id}
            onSelect={() => onSelect(node.id)}
            onMove={(x, y) => onMove(node.id, x, y)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Radial / sunburst layout. Direct children of root are placed evenly around
 * a circle; descendants fan out along the parent's angle. Keeps the root
 * fixed and only rearranges descendants, so previously hand-placed roots
 * stay where the user put them.
 */
function radialLayout(nodes: MapNode[]): MapNode[] {
  if (nodes.length === 0) return nodes
  const root = nodes.find((n) => !n.parentId) ?? nodes[0]
  const byParent = new Map<string, MapNode[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, [])
    byParent.get(n.parentId)!.push(n)
  }

  const placed = new Map<string, { x: number; y: number }>()
  placed.set(root.id, { x: root.x, y: root.y })

  type Frame = { node: MapNode; depth: number; startAngle: number; endAngle: number }
  const stack: Frame[] = [{ node: root, depth: 0, startAngle: 0, endAngle: Math.PI * 2 }]

  while (stack.length > 0) {
    const frame = stack.pop()!
    const children = byParent.get(frame.node.id) ?? []
    if (children.length === 0) continue
    const sweep = (frame.endAngle - frame.startAngle) / children.length
    const radius = 130 + frame.depth * 110
    const parentPos = placed.get(frame.node.id)!
    children.forEach((child, i) => {
      const angle = frame.startAngle + sweep * (i + 0.5)
      const x = parentPos.x + Math.cos(angle) * radius
      const y = parentPos.y + Math.sin(angle) * radius
      placed.set(child.id, { x, y })
      stack.push({
        node: child,
        depth: frame.depth + 1,
        startAngle: frame.startAngle + sweep * i,
        endAngle: frame.startAngle + sweep * (i + 1),
      })
    })
  }

  return nodes.map((n) => {
    const pos = placed.get(n.id)
    return pos ? { ...n, x: pos.x, y: pos.y } : n
  })
}

function BackgroundDots() {
  return (
    <svg className="absolute inset-0 h-full w-full pointer-events-none">
      <defs>
        <pattern id="bg-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="hsl(var(--border))" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg-dots)" />
    </svg>
  )
}

function MapNodeChip({
  node,
  selected,
  onSelect,
  onMove,
}: {
  node: MapNode
  selected: boolean
  onSelect: () => void
  onMove: (x: number, y: number) => void
}) {
  const isRoot = !node.parentId
  return (
    <div
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs font-medium border shadow-card cursor-grab',
        isRoot && 'bg-brand-gradient text-white border-transparent',
        !isRoot && !node.color && 'bg-card border-accent/40 text-foreground',
        selected && 'ring-2 ring-brand-500',
      )}
      style={{
        left: node.x,
        top: node.y,
        ...(node.color && !isRoot
          ? {
              backgroundColor: `${node.color}22`, // 13% opaque
              borderColor: node.color,
              color: 'inherit',
            }
          : {}),
      }}
      onMouseDown={(e) => {
        onSelect()
        const startX = e.clientX
        const startY = e.clientY
        const baseX = node.x
        const baseY = node.y
        const move = (evt: MouseEvent) => onMove(baseX + evt.clientX - startX, baseY + evt.clientY - startY)
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
    >
      <span className="flex items-center gap-1.5">
        {node.color && !isRoot && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: node.color }}
          />
        )}
        {node.label}
      </span>
    </div>
  )
}
