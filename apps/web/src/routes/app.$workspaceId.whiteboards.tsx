import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Card, Button, Input, cn } from '@rundesk/ui'
import { Frame, Plus, Square, StickyNote, Type } from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/whiteboards')({
  component: WhiteboardsPage,
})

type Whiteboard = {
  id: string
  title: string
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

const MOCK_BOARDS: Whiteboard[] = [
  { id: 'board-1', title: 'Roadmap planning board' },
  { id: 'board-2', title: 'Sprint retrospective board' },
]

function WhiteboardsPage() {
  const [query, setQuery] = useState('')
  const [activeBoardId, setActiveBoardId] = useState<string>(MOCK_BOARDS[0].id)
  const [items, setItems] = useState<BoardItem[]>([
    { id: 'n1', type: 'note', x: 80, y: 110, w: 180, h: 120, content: 'Launch checklist', color: '#fde68a' },
    { id: 'n2', type: 'shape', x: 380, y: 180, w: 190, h: 90, content: 'API sync', color: '#bfdbfe' },
    { id: 'n3', type: 'text', x: 660, y: 120, w: 170, h: 48, content: 'Customer journey', color: '#ddd6fe' },
  ])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const filtered = useMemo(
    () => MOCK_BOARDS.filter((b) => b.title.toLowerCase().includes(query.toLowerCase())),
    [query],
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
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Interactive canvas with draggable items.</p>
        </div>
        <div className="flex items-center gap-2">
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
          {filtered.map((b) => (
            <button
              key={b.id}
              className={cn(
                'w-full text-left rounded px-3 py-2 text-sm',
                b.id === activeBoardId ? 'bg-accent/15 text-foreground' : 'hover:bg-card/60 text-muted-foreground',
              )}
              onClick={() => setActiveBoardId(b.id)}
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
