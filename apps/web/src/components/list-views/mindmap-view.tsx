import { useMemo, useRef, useState } from 'react'
import { Card, cn } from '@rundesk/ui'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'

/** What a node needs of a task — the list route's rows carry all of it. */
export type MindMapTask = {
  id: string
  title?: string
  status?: string | null
  statusCategory?: string | null
  parentTaskId?: string | null
  subtasks?: Array<{ id: string; title?: string; status?: string | null; statusCategory?: string | null }>
  mayEdit?: boolean
}

type Node = {
  id: string
  title: string
  done: boolean
  depth: 1 | 2
  parentId: string | null
  children: Node[]
}

const NODE_W = 220
const NODE_H = 34
const COL_GAP = 72
const ROW_GAP = 10
const PAD = 16

/**
 * A LIST'S MIND MAP, Tasks mode (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * ClickUp's Tasks mode draws every task in the location as a node, its
 * subtasks nested under it, all under the location itself. Clicking a node
 * opens the task; a node can be dragged onto another to re-parent the task;
 * a new task can be made from a node. Here the root is the list, its
 * children the list's tasks and their children the subtasks — one level,
 * which is as deep as a subtask goes in Rundesk. A drop is a `parentTaskId`
 * change the server judges: a task with subtasks cannot become a subtask, a
 * subtask cannot take one, and a refusal is said and leaves the tree as the
 * server has it.
 */
export function MindMapView({
  tasks,
  listName,
  mayAdd,
  onOpenTask,
  onCreate,
  onReparent,
}: {
  tasks: MindMapTask[]
  listName: string
  /** May this reader add tasks here (the list's create rule). */
  mayAdd: boolean
  onOpenTask: (id: string) => void
  onCreate: (title: string, parentTaskId: string | null) => Promise<void>
  onReparent: (taskId: string, parentTaskId: string | null) => Promise<void>
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [adding, setAddingState] = useState<string | null>(null) // 'root' or a task id
  // The add box in hand, read synchronously: Enter submits and unmounts the box,
  // and the blur that unmounting fires must not submit the same title again.
  const addingRef = useRef<string | null>(null)
  const setAdding = (to: string | null) => {
    addingRef.current = to
    setAddingState(to)
  }
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // The tree: tasks with no parent here are the root's children; a subtask
  // whose parent is not in this list stands at the top, as it would in List view.
  const tree = useMemo(() => {
    const ids = new Set(tasks.map((task) => task.id))
    const closed = (c?: string | null) => c === 'closed' || c === 'done'
    const tops: Node[] = []
    const seen = new Set<string>()
    for (const task of tasks) {
      if (task.parentTaskId && ids.has(task.parentTaskId)) continue
      if (seen.has(task.id)) continue
      seen.add(task.id)
      const children: Node[] = []
      for (const sub of task.subtasks ?? []) {
        if (seen.has(sub.id)) continue
        seen.add(sub.id)
        children.push({ id: sub.id, title: sub.title ?? '', done: closed(sub.statusCategory), depth: 2, parentId: task.id, children: [] })
      }
      // A subtask row the list also drew on its own, not yet among `subtasks`.
      for (const row of tasks) {
        if (row.parentTaskId === task.id && !seen.has(row.id)) {
          seen.add(row.id)
          children.push({ id: row.id, title: row.title ?? '', done: closed(row.statusCategory), depth: 2, parentId: task.id, children: [] })
        }
      }
      tops.push({ id: task.id, title: task.title ?? '', done: closed(task.statusCategory), depth: 1, parentId: null, children })
    }
    return tops
  }, [tasks])

  // Layout: one row per shown leaf; a task sits at the middle of its subtasks.
  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    let row = 0
    const yOf = (r: number) => PAD + r * (NODE_H + ROW_GAP)
    for (const top of tree) {
      const open = !collapsed.has(top.id) && top.children.length > 0
      if (open) {
        const first = row
        for (const child of top.children) {
          pos.set(child.id, { x: PAD + 2 * (NODE_W + COL_GAP), y: yOf(row) })
          row += 1
        }
        pos.set(top.id, { x: PAD + NODE_W + COL_GAP, y: (yOf(first) + yOf(row - 1)) / 2 })
      } else {
        pos.set(top.id, { x: PAD + NODE_W + COL_GAP, y: yOf(row) })
        row += 1
      }
    }
    const rows = Math.max(row, 1)
    const rootY = (yOf(0) + yOf(rows - 1)) / 2
    return {
      pos,
      root: { x: PAD, y: rootY },
      width: PAD * 2 + 3 * NODE_W + 2 * COL_GAP,
      height: PAD * 2 + rows * (NODE_H + ROW_GAP) - ROW_GAP + (adding ? NODE_H + ROW_GAP : 0),
    }
  }, [tree, collapsed, adding])

  const edge = (from: { x: number; y: number }, to: { x: number; y: number }, key: string) => {
    const x1 = from.x + NODE_W
    const y1 = from.y + NODE_H / 2
    const x2 = to.x
    const y2 = to.y + NODE_H / 2
    const mid = (x1 + x2) / 2
    return <path key={key} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" className="stroke-border" strokeWidth={1.5} />
  }

  const submit = async () => {
    const target = addingRef.current
    if (target === null) return
    const title = draft.trim()
    const parent = target === 'root' ? null : target
    if (!title) {
      setAdding(null)
      return
    }
    setDraft('')
    setAdding(null)
    await onCreate(title, parent)
  }

  // A drop on the root makes the task one of the list's own; on a task, its subtask.
  const drop = async (target: string | null) => {
    const id = dragId
    setDragId(null)
    setOverId(null)
    if (!id || id === target) return
    const node = tree.find((n) => n.id === id) ?? tree.flatMap((n) => n.children).find((n) => n.id === id)
    if (!node || node.parentId === target) return
    await onReparent(id, target)
  }

  const nodeBox = (
    node: { id: string; title: string; done: boolean },
    at: { x: number; y: number },
    kind: 'task' | 'subtask',
    extra?: { childCount: number; open: boolean },
  ) => (
    <div
      key={node.id}
      data-testid="mindmap-node"
      data-task-id={node.id}
      data-kind={kind}
      data-drop-over={overId === node.id ? 'true' : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', node.id)
        setDragId(node.id)
      }}
      onDragEnd={() => {
        setDragId(null)
        setOverId(null)
      }}
      onDragOver={(e) => {
        if (kind !== 'task' || !dragId || dragId === node.id) return
        e.preventDefault()
        setOverId(node.id)
      }}
      onDragLeave={() => setOverId((cur) => (cur === node.id ? null : cur))}
      onDrop={(e) => {
        e.preventDefault()
        if (kind === 'task') void drop(node.id)
      }}
      style={{ left: at.x, top: at.y, width: NODE_W, height: NODE_H }}
      className={cn(
        'absolute flex items-center gap-1 rounded-lg border bg-background px-2 text-sm shadow-sm',
        overId === node.id ? 'border-brand-500 ring-2 ring-brand-300' : 'border-border',
        dragId === node.id && 'opacity-50',
      )}
    >
      {extra && extra.childCount > 0 ? (
        <button
          type="button"
          data-testid="mindmap-toggle"
          aria-expanded={extra.open}
          aria-label={extra.open ? t('list.mindmap.collapse') : t('list.mindmap.expand')}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={() =>
            setCollapsed((cur) => {
              const next = new Set(cur)
              if (next.has(node.id)) next.delete(node.id)
              else next.add(node.id)
              return next
            })
          }
        >
          {extra.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : null}
      <button
        type="button"
        data-testid="mindmap-node-title"
        className={cn('min-w-0 flex-1 truncate text-left hover:underline', node.done && 'text-muted-foreground line-through')}
        onClick={() => onOpenTask(node.id)}
        title={node.title}
      >
        {node.title || t('list.mindmap.untitled')}
      </button>
      {extra && !extra.open && extra.childCount > 0 && (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground" data-testid="mindmap-hidden-count">
          {extra.childCount}
        </span>
      )}
      {kind === 'task' && mayAdd && (
        <button
          type="button"
          data-testid="mindmap-add-child"
          aria-label={t('list.mindmap.addSubtask')}
          title={t('list.mindmap.addSubtask')}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
          onClick={() => {
            setAdding(node.id)
            setDraft('')
            setCollapsed((cur) => {
              const next = new Set(cur)
              next.delete(node.id)
              return next
            })
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  const addAt = (() => {
    if (!adding) return null
    if (adding === 'root') return { x: PAD + NODE_W + COL_GAP, y: layout.height - PAD - NODE_H }
    const parent = layout.pos.get(adding)
    if (!parent) return null
    const node = tree.find((n) => n.id === adding)
    const last = node?.children.length ? layout.pos.get(node.children[node.children.length - 1].id) : null
    return { x: PAD + 2 * (NODE_W + COL_GAP), y: last ? last.y + NODE_H + ROW_GAP : parent.y }
  })()

  const nodeCount = tree.reduce((n, top) => n + 1 + top.children.length, 0)

  return (
    <Card className="overflow-auto p-0" data-testid="mindmap-view" data-node-count={nodeCount}>
      <div className="relative" style={{ width: layout.width, height: Math.max(layout.height, 120) }}>
        <svg className="pointer-events-none absolute inset-0" width={layout.width} height={Math.max(layout.height, 120)} aria-hidden>
          {tree.map((top) => {
            const at = layout.pos.get(top.id)
            if (!at) return null
            const open = !collapsed.has(top.id)
            return (
              <g key={top.id}>
                {edge(layout.root, at, `r-${top.id}`)}
                {open &&
                  top.children.map((child) => {
                    const c = layout.pos.get(child.id)
                    return c ? edge(at, c, `c-${child.id}`) : null
                  })}
              </g>
            )
          })}
          {addAt && edge(adding === 'root' ? layout.root : (layout.pos.get(adding!) ?? layout.root), addAt, 'adding')}
        </svg>
        <div
          data-testid="mindmap-root"
          data-drop-over={overId === 'root' ? 'true' : undefined}
          onDragOver={(e) => {
            if (!dragId) return
            e.preventDefault()
            setOverId('root')
          }}
          onDragLeave={() => setOverId((cur) => (cur === 'root' ? null : cur))}
          onDrop={(e) => {
            e.preventDefault()
            void drop(null)
          }}
          style={{ left: layout.root.x, top: layout.root.y, width: NODE_W, height: NODE_H }}
          className={cn(
            'absolute flex items-center gap-1 rounded-lg border-2 bg-brand-50 px-2 text-sm font-semibold dark:bg-brand-900/30',
            overId === 'root' ? 'border-brand-500 ring-2 ring-brand-300' : 'border-brand-300',
          )}
        >
          <span className="min-w-0 flex-1 truncate" title={listName}>
            {listName}
          </span>
          {mayAdd && (
            <button
              type="button"
              data-testid="mindmap-add-task"
              aria-label={t('list.mindmap.addTask')}
              title={t('list.mindmap.addTask')}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
              onClick={() => {
                setAdding('root')
                setDraft('')
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {tree.map((top) => {
          const at = layout.pos.get(top.id)
          const open = !collapsed.has(top.id)
          return (
            <div key={top.id}>
              {at && nodeBox(top, at, 'task', { childCount: top.children.length, open })}
              {open &&
                top.children.map((child) => {
                  const c = layout.pos.get(child.id)
                  return c ? nodeBox(child, c, 'subtask') : null
                })}
            </div>
          )
        })}
        {addAt && (
          <input
            autoFocus
            data-testid="mindmap-new-title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') setAdding(null)
            }}
            onBlur={() => void submit()}
            placeholder={adding === 'root' ? t('list.mindmap.newTask') : t('list.mindmap.newSubtask')}
            style={{ left: addAt.x, top: addAt.y, width: NODE_W, height: NODE_H }}
            className="absolute rounded-lg border border-brand-400 bg-background px-2 text-sm outline-none"
          />
        )}
      </div>
    </Card>
  )
}
