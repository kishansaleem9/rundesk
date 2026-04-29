import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  Button,
  Input,
  cn,
} from '@rundesk/ui'
import {
  Plus,
  Network,
  GitBranchPlus,
} from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/mindmaps')({
  component: MindMapsPage,
})

type MindMap = {
  id: string
  title: string
}
type MapNode = { id: string; label: string; x: number; y: number; parentId?: string }

const MOCK_MAPS: MindMap[] = [
  { id: 'product-vision', title: 'Product vision — Q3 strategy' },
  { id: 'feature-tree', title: 'Feature tree — what to build next' },
  { id: 'user-research', title: 'User research findings' },
]

function MindMapsPage() {
  const [active, setActive] = useState<MindMap | null>(null)
  const [query, setQuery] = useState('')
  const [nodes, setNodes] = useState<MapNode[]>([
    { id: 'root', label: 'Root Topic', x: 520, y: 260 },
    { id: 'n-1', label: 'Goals', x: 320, y: 170, parentId: 'root' },
    { id: 'n-2', label: 'Risks', x: 710, y: 180, parentId: 'root' },
    { id: 'n-3', label: 'Ideas', x: 690, y: 360, parentId: 'root' },
  ])
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root')
  const [draftLabel, setDraftLabel] = useState('')
  const filtered = MOCK_MAPS.filter((m) =>
    m.title.toLowerCase().includes(query.toLowerCase()),
  )

  if (active) {
    return (
      <MindMapEditor
        map={active}
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        draftLabel={draftLabel}
        onBack={() => setActive(null)}
        onSelect={(id) => {
          setSelectedNodeId(id)
          const node = nodes.find((n) => n.id === id)
          setDraftLabel(node?.label ?? '')
        }}
        onMove={(id, x, y) => {
          setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)))
        }}
        onCreateChild={() => {
          const base = nodes.find((n) => n.id === selectedNodeId)
          if (!base) return
          const id = `n-${Date.now()}`
          setNodes((prev) => [...prev, { id, label: 'New branch', x: base.x + 160, y: base.y + 40, parentId: base.id }])
        }}
        onLabelChange={(value) => {
          setDraftLabel(value)
          setNodes((prev) => prev.map((n) => (n.id === selectedNodeId ? { ...n, label: value } : n)))
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
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Brainstorm at the speed of thought. Drop nodes, connect them, convert any branch into a task.
          </p>
        </div>
        <Button variant="gradient" size="lg">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Card
            key={m.id}
            variant="glass"
            className="cursor-pointer p-0 overflow-hidden transition-all hover:shadow-glow hover:border-accent/40"
            onClick={() => setActive(m)}
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
}) {
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  return (
    <div className="h-full flex flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← All maps
          </Button>
          <div>
            <div className="font-display font-semibold">{map.title}</div>
            <div className="text-xs text-muted-foreground">{nodes.length} nodes</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input value={draftLabel} onChange={(e) => onLabelChange(e.target.value)} className="w-56 h-8" placeholder="Node label" />
          <Button variant="outline" size="sm" onClick={onCreateChild}><GitBranchPlus className="h-3.5 w-3.5" /> Add child</Button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden bg-card/20">
        <BackgroundDots />
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
                  stroke="hsl(var(--border))"
                  strokeWidth="2"
                  fill="none"
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
        isRoot ? 'bg-brand-gradient text-white border-transparent' : 'bg-card border-accent/40 text-foreground',
        selected && 'ring-2 ring-brand-500',
      )}
      style={{ left: node.x, top: node.y }}
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
      {node.label}
    </div>
  )
}
