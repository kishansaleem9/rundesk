import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Folder, FolderKanban, List as ListIcon, Search } from 'lucide-react'
import { Checkbox, Input, Popover, PopoverContent, PopoverTrigger, cn } from '@rundesk/ui'
import { api } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import type { LocationRef } from '../../lib/imports-exports-api'
import { InlineSkeleton } from '../loading-skeletons'
import {
  buildLocationTree,
  filterTree,
  flattenTree,
  nodeKey,
  selectionToLocations,
  toggleNode,
  type MoveTargetSpace,
  type TreeNode,
} from './location-tree'

/** The spaces this person may add to, with their folders, projects and lists — the Move picker's own answer. */
export function useLocationTree(workspaceId: string) {
  const query = useQuery({
    queryKey: ['move-targets', workspaceId],
    queryFn: () => api<MoveTargetSpace[]>(`/spaces/workspace/${workspaceId}/move-targets`),
  })
  const tree = useMemo(() => buildLocationTree(query.data ?? []), [query.data])
  return { tree, loading: query.isLoading }
}

function NodeIcon({ node }: { node: TreeNode }) {
  if (node.type === 'space') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
        style={{ background: node.color ?? 'hsl(var(--accent))' }}
      >
        {node.name.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  const Icon = node.type === 'folder' ? Folder : node.type === 'project' ? FolderKanban : ListIcon
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
}

/** Arrow keys move between the tree's rows; Escape is the popover's own. */
function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-tree-row]'))
  const at = rows.indexOf(document.activeElement as HTMLElement)
  const next = rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1)]
  if (next) {
    e.preventDefault()
    next.focus()
  }
}

function TreeSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('ie.search')}
        className="h-8 pl-8 text-sm"
        data-testid="location-search"
      />
    </div>
  )
}

/**
 * §2.2 "CHOOSE WHERE TO IMPORT YOUR TASKS." — one Space, Folder, Project or
 * List, from a searchable "Browse" tree.
 */
export function LocationPicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string
  value: (LocationRef & { path: string }) | null
  onChange: (next: LocationRef & { path: string }) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { tree, loading } = useLocationTree(workspaceId)
  const rows = useMemo(() => flattenTree(filterTree(tree, query)), [tree, query])
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm hover:border-accent/60"
          data-testid="import-location-picker"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value?.path ?? t('ie.selectLocation')}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-2">
        <TreeSearch value={query} onChange={setQuery} />
        <div className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('ie.browse')}</div>
        <div className="mt-1 max-h-72 overflow-y-auto" onKeyDown={moveFocus} role="tree">
          {loading && <InlineSkeleton />}
          {!loading && rows.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">{t('ie.noLocations')}</div>}
          {rows.map((n) => (
            <button
              key={nodeKey(n)}
              type="button"
              data-tree-row
              role="treeitem"
              data-testid={`location-${n.type}-${n.id}`}
              onClick={() => {
                onChange({ type: n.type, id: n.id, path: n.path })
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent/15 focus:bg-accent/15 focus:outline-none',
                value && nodeKey(value) === nodeKey(n) && 'bg-accent/15',
              )}
              style={{ paddingLeft: 8 + n.depth * 16 }}
            >
              <NodeIcon node={n} />
              <span className="truncate">{n.name}</span>
              {value && nodeKey(value) === nodeKey(n) && <Check className="ml-auto h-3.5 w-3.5 text-accent" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * §5.1 Export's location multi-select: "Search...", "Browse" with "Select
 * All", and a checkbox per Space, Folder, Project and List — a parent's tick
 * ticks everything under it.
 */
export function LocationMultiSelect({
  workspaceId,
  selected,
  onChange,
}: {
  workspaceId: string
  selected: ReadonlySet<string>
  onChange: (next: Set<string>, locations: LocationRef[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { tree, loading } = useLocationTree(workspaceId)
  const rows = useMemo(() => flattenTree(filterTree(tree, query)), [tree, query])
  const all = useMemo(() => flattenTree(tree), [tree])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const locations = selectionToLocations(selected, tree)
  const set = (next: Set<string>) => onChange(next, selectionToLocations(next, tree))
  const allOn = all.length > 0 && all.every((n) => selected.has(nodeKey(n)))
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm hover:border-accent/60"
          data-testid="export-location-picker"
        >
          <span className={cn('truncate', !locations.length && 'text-muted-foreground')}>
            {locations.length
              ? locations.length === 1
                ? all.find((n) => nodeKey(n) === nodeKey(locations[0]))?.path
                : t('ie.locationsSelected', { count: locations.length })
              : t('ie.selectLocation')}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[340px] p-2">
        <TreeSearch value={query} onChange={setQuery} />
        <div className="mt-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('ie.browse')}</span>
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            data-testid="export-select-all"
            onClick={() => set(allOn ? new Set() : new Set(all.map(nodeKey)))}
          >
            {allOn ? t('ie.clearAll') : t('ie.selectAll')}
          </button>
        </div>
        <div className="mt-1 max-h-80 overflow-y-auto" onKeyDown={moveFocus} role="tree">
          {loading && <InlineSkeleton />}
          {!loading && rows.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">{t('ie.noLocations')}</div>}
          {rows.map((n) => {
            const on = selected.has(nodeKey(n))
            return (
              <label
                key={nodeKey(n)}
                data-tree-row
                tabIndex={0}
                role="treeitem"
                aria-selected={on}
                data-testid={`export-location-${n.type}-${n.id}`}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    set(toggleNode(selected, n, tree))
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/15 focus:bg-accent/15 focus:outline-none"
                style={{ paddingLeft: 8 + n.depth * 16 }}
              >
                <Checkbox checked={on} onCheckedChange={() => set(toggleNode(selected, n, tree))} tabIndex={-1} />
                <NodeIcon node={n} />
                <span className="truncate">{n.name}</span>
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
