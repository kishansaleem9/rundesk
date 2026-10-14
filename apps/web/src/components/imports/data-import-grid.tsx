/**
 * §2.3 — the Spreadsheets Importer's review grid, RUNDESK's own equivalent of
 * the embedded Flatfile ClickUp uses.
 *
 * Rows are virtualised (10,000 of them scroll as easily as ten), the header
 * and the first columns stay put while the rest scroll sideways, and every
 * cell shows the verdict `@rundesk/imports` gives it: yellow when that cell
 * will not import, red when its row will not. Double-click edits a cell and
 * the verdict is taken again at once.
 */

import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Columns3,
  Eraser,
  Filter,
  Pin,
  Plus,
  Replace,
  Search,
  SearchCode,
  Trash2,
  Download,
  Upload,
  X,
  ChevronDown,
} from 'lucide-react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
  toast,
} from '@rundesk/ui'
import type { CellIssue, GridColumn, GridRow, GridVerdict } from '@rundesk/imports'
import { useTranslation } from '../../lib/i18n'
import {
  blankRow,
  clearColumn,
  deleteRows,
  distinctValues,
  findAndReplace,
  replaceEmpty,
  rowsToCsv,
  setCell,
  sortRows,
  visibleRows,
  type RowView,
  type ViewFilter,
} from './grid-ops'

const ROW_HEIGHT = 34
const CHECK_WIDTH = 40
const NAME_WIDTH = 260
const COL_WIDTH = 180

type ColumnDialog = { kind: 'findReplace' | 'replaceEmpty' | 'filterValue'; column: GridColumn } | null

export function DataImportGrid({
  columns,
  rows,
  verdict,
  onRowsChange,
  onImport,
  importDisabled,
  importing,
  onFile,
  onManual,
  booting,
  banner,
}: {
  columns: GridColumn[]
  rows: GridRow[]
  verdict: GridVerdict | null
  onRowsChange: (rows: GridRow[]) => void
  onImport: () => void
  importDisabled: boolean
  importing: boolean
  /** The empty state's "Upload file" (and a drop). */
  onFile: (file: File) => void
  /** The empty state's "Manually enter data". */
  onManual: () => void
  /** Skeleton rows while a file is being read. */
  booting?: boolean
  banner?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<RowView>({ filter: 'all', search: '' })
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pinned, setPinned] = useState<string[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ row: string; column: string; value: string } | null>(null)
  const [dialog, setDialog] = useState<ColumnDialog>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const issues = useMemo(() => verdict?.issues ?? new Map<string, CellIssue[]>(), [verdict])
  const shown = useMemo(() => visibleRows(rows, issues, view), [rows, issues, view])

  // Task Name first, then pinned columns, then the rest in §2.3's order.
  const ordered = useMemo(() => {
    const visible = columns.filter((c) => c.key === 'taskName' || !hidden.has(c.key))
    const name = visible.filter((c) => c.key === 'taskName')
    const pins = pinned.map((k) => visible.find((c) => c.key === k)).filter((c): c is GridColumn => Boolean(c) && c!.key !== 'taskName')
    const rest = visible.filter((c) => c.key !== 'taskName' && !pinned.includes(c.key))
    return { sticky: [...name, ...pins], rest }
  }, [columns, hidden, pinned])
  const widthOf = (c: GridColumn) => (c.key === 'taskName' ? NAME_WIDTH : COL_WIDTH)
  const stickyLeft = (i: number) => CHECK_WIDTH + ordered.sticky.slice(0, i).reduce((s, c) => s + widthOf(c), 0)
  const totalWidth = CHECK_WIDTH + [...ordered.sticky, ...ordered.rest].reduce((s, c) => s + widthOf(c), 0)

  const virtual = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const commitEdit = () => {
    if (!editing) return
    onRowsChange(setCell(rows, editing.row, editing.column, editing.value))
    setEditing(null)
  }

  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.key))
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.key)))

  const download = () => {
    const pick = selected.size ? rows.filter((r) => selected.has(r.key)) : rows
    const blob = new Blob([rowsToCsv(pick, columns)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-rows.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  const headerCell = (c: GridColumn, stickyIndex?: number) => (
    <div
      key={c.key}
      className={cn(
        'flex h-full items-center border-b border-r border-border/60 bg-card px-2 text-xs font-semibold',
        stickyIndex !== undefined && 'sticky z-20',
      )}
      style={{ width: widthOf(c), left: stickyIndex !== undefined ? stickyLeft(stickyIndex) : undefined }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between gap-1 truncate text-left hover:text-accent" data-testid={`grid-header-${c.key}`}>
            <span className="truncate">
              {c.label}
              {c.required && <span className="text-destructive">*</span>}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onClick={() => onRowsChange(sortRows(rows, c.key, 'asc'))}>
            <ArrowDownAZ className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.sortAz')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRowsChange(sortRows(rows, c.key, 'desc'))}>
            <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.sortZa')}
          </DropdownMenuItem>
          {c.key !== 'taskName' && (
            <DropdownMenuItem onClick={() => setPinned((p) => (p.includes(c.key) ? p.filter((k) => k !== c.key) : [...p, c.key]))}>
              <Pin className="mr-2 h-3.5 w-3.5" />
              {pinned.includes(c.key) ? t('ie.grid.unpinColumn') : t('ie.grid.pinColumn')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setView((v) => ({ ...v, field: { column: c.key, value: '', exact: false } }))
            }}
          >
            <SearchCode className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.searchInField')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: 'findReplace', column: c })}>
            <Replace className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.findReplace')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: 'replaceEmpty', column: c })}>
            <Replace className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.replaceEmpty')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: 'filterValue', column: c })}>
            <Filter className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.filterByValue')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => onRowsChange(clearColumn(rows, c.key))}>
            <Eraser className="mr-2 h-3.5 w-3.5" />
            {t('ie.grid.clearColumn')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const bodyCell = (row: GridRow, c: GridColumn, stickyIndex?: number) => {
    const cellIssues = (issues.get(row.key) ?? []).filter((i) => i.column === c.key)
    const red = cellIssues.some((i) => i.severity === 'invalid')
    const yellow = !red && cellIssues.some((i) => i.severity === 'format')
    const isEditing = editing?.row === row.key && editing.column === c.key
    return (
      <div
        key={c.key}
        className={cn(
          'flex h-full items-center border-b border-r border-border/40 px-2 text-sm',
          stickyIndex !== undefined ? 'sticky z-10 bg-background' : '',
          red && 'bg-red-500/15 dark:bg-red-500/20',
          yellow && 'bg-yellow-400/20 dark:bg-yellow-400/15',
        )}
        style={{ width: widthOf(c), left: stickyIndex !== undefined ? stickyLeft(stickyIndex) : undefined }}
        title={cellIssues.map((i) => i.message).join('\n') || undefined}
        data-testid={`grid-cell-${row.key}-${c.key}`}
        data-verdict={red ? 'invalid' : yellow ? 'format' : 'ok'}
        onDoubleClick={() => setEditing({ row: row.key, column: c.key, value: row.values[c.key] ?? '' })}
      >
        {isEditing ? (
          <input
            autoFocus
            className="h-7 w-full rounded border border-accent bg-background px-1.5 text-sm outline-none"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(null)
            }}
            data-testid="grid-cell-editor"
          />
        ) : (
          <span className="truncate">{row.values[c.key] ?? ''}</span>
        )}
      </div>
    )
  }

  const empty = rows.length === 0 && !booting

  return (
    <div className="space-y-3" data-testid="data-import-grid">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="rounded-t-md border border-b-0 border-border/60 bg-card px-3 py-1.5" data-testid="grid-tab-label">
          {t('ie.grid.tab')}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2 py-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={empty} data-testid="grid-filter">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {t('ie.grid.filter')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <FilterPicker
              columns={columns}
              rows={rows}
              onPick={(column, value) => setView((v) => ({ ...v, field: { column, value, exact: true } }))}
            />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="sm" disabled={empty} onClick={() => setSearchOpen((o) => !o)} aria-label={t('ie.search')} data-testid="grid-search-toggle">
          <Search className="h-3.5 w-3.5" />
        </Button>
        {searchOpen && (
          <Input
            autoFocus
            value={view.search}
            onChange={(e) => setView((v) => ({ ...v, search: e.target.value }))}
            placeholder={t('ie.search')}
            className="h-8 w-48"
            data-testid="grid-search"
          />
        )}
        <ActionsMenu
          disabled={empty}
          selectedCount={selected.size}
          onDelete={() => {
            if (!selected.size) return toast.error(t('ie.grid.selectRowsFirst'))
            onRowsChange(deleteRows(rows, selected))
            toast.success(t('ie.grid.rowsDeleted', { count: selected.size }))
            setSelected(new Set())
          }}
          onDownload={download}
        />
        {view.field && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs" data-testid="grid-field-filter">
            {columns.find((c) => c.key === view.field!.column)?.label}:
            {view.field.exact ? (
              <strong className="max-w-[140px] truncate">{view.field.value || t('ie.grid.empty')}</strong>
            ) : (
              <input
                autoFocus
                className="w-28 bg-transparent outline-none"
                value={view.field.value}
                placeholder={t('ie.search')}
                onChange={(e) => setView((v) => ({ ...v, field: { ...v.field!, value: e.target.value } }))}
              />
            )}
            <button type="button" onClick={() => setView((v) => ({ ...v, field: undefined }))} aria-label={t('ie.clear')}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground" data-testid="grid-record-count">
            {t('ie.grid.records', { count: shown.length.toLocaleString('en-GB') })}
          </span>
          <div className="grid grid-cols-3 gap-0.5 rounded-md border border-border/60 p-0.5" role="group">
            {(['all', 'valid', 'invalid'] as ViewFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={view.filter === f}
                data-testid={`grid-view-${f}`}
                onClick={() => setView((v) => ({ ...v, filter: f }))}
                className={cn('rounded px-2.5 py-1 text-xs', view.filter === f ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground')}
              >
                {t(f === 'all' ? 'ie.grid.all' : f === 'valid' ? 'ie.grid.valid' : 'ie.grid.invalid')}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={t('ie.grid.columnSettings')} data-testid="grid-column-settings">
                <Columns3 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('ie.grid.columns')}</div>
              <div className="max-h-72 overflow-y-auto">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/10">
                    <Checkbox
                      checked={c.key === 'taskName' || !hidden.has(c.key)}
                      disabled={c.key === 'taskName'}
                      onCheckedChange={() =>
                        setHidden((h) => {
                          const next = new Set(h)
                          if (next.has(c.key)) next.delete(c.key)
                          else next.add(c.key)
                          return next
                        })
                      }
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={onImport} disabled={importDisabled || importing} className="disabled:opacity-40" data-testid="grid-import">
            {importing ? t('ie.working') : t('ie.grid.importInto')}
          </Button>
        </div>
      </div>

      {banner}

      {/* Body */}
      <div
        ref={scroller}
        className={cn('relative h-[60vh] min-h-[320px] overflow-auto rounded-md border border-border/60', dragOver && 'ring-2 ring-accent')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="grid-body"
      >
        {booting ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" data-testid="grid-empty">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('ie.grid.emptyState')}</p>
            <div className="flex gap-2">
              <Button onClick={() => fileInput.current?.click()} data-testid="grid-upload">
                {t('ie.grid.uploadFile')}
              </Button>
              <Button variant="outline" onClick={onManual} data-testid="grid-manual">
                {t('ie.grid.manualEntry')}
              </Button>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">{t('ie.grid.acceptedFiles')}</p>
          </div>
        ) : (
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            <div className="sticky top-0 z-30 flex h-9" style={{ width: totalWidth }}>
              <div className="sticky left-0 z-20 flex h-full items-center justify-center border-b border-r border-border/60 bg-card" style={{ width: CHECK_WIDTH }}>
                <Checkbox checked={allShownSelected} onCheckedChange={toggleAll} aria-label={t('ie.grid.selectAllRows')} data-testid="grid-select-all" />
              </div>
              {ordered.sticky.map((c, i) => headerCell(c, i))}
              {ordered.rest.map((c) => headerCell(c))}
            </div>
            <div className="relative" style={{ height: virtual.getTotalSize(), width: totalWidth }}>
              {virtual.getVirtualItems().map((item) => {
                const row = shown[item.index]
                return (
                  <div
                    key={row.key}
                    className="absolute left-0 flex"
                    style={{ top: item.start, height: ROW_HEIGHT, width: totalWidth }}
                    data-testid={`grid-row-${row.key}`}
                  >
                    <div className="sticky left-0 z-10 flex h-full items-center justify-center border-b border-r border-border/40 bg-background" style={{ width: CHECK_WIDTH }}>
                      <Checkbox
                        checked={selected.has(row.key)}
                        onCheckedChange={() =>
                          setSelected((s) => {
                            const next = new Set(s)
                            if (next.has(row.key)) next.delete(row.key)
                            else next.add(row.key)
                            return next
                          })
                        }
                        aria-label={t('ie.grid.selectRow')}
                      />
                    </div>
                    {ordered.sticky.map((c, i) => bodyCell(row, c, i))}
                    {ordered.rest.map((c) => bodyCell(row, c))}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".xls,.xlsx,.csv,.tsv,.txt,.json"
          className="hidden"
          data-testid="grid-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {!empty && !booting && (
        <Button variant="ghost" size="sm" onClick={() => onRowsChange([...rows, blankRow(rows)])} data-testid="grid-add-row">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('ie.grid.addRow')}
        </Button>
      )}

      <ColumnActionDialog
        dialog={dialog}
        rows={rows}
        onClose={() => setDialog(null)}
        onApply={(next, changed) => {
          onRowsChange(next)
          toast.success(t('ie.grid.cellsChanged', { count: changed }))
          setDialog(null)
        }}
        onFilter={(column, value) => {
          setView((v) => ({ ...v, field: { column, value, exact: true } }))
          setDialog(null)
        }}
      />
    </div>
  )
}

/** "Actions": a "Search or select..." box over Delete and Download, acting on the selected rows. */
function ActionsMenu({ disabled, selectedCount, onDelete, onDownload }: { disabled: boolean; selectedCount: number; onDelete: () => void; onDownload: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const items = [
    { id: 'delete', label: t('ie.grid.delete'), icon: Trash2, run: onDelete },
    { id: 'download', label: t('ie.grid.download'), icon: Download, run: onDownload },
  ].filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <DropdownMenu onOpenChange={(o) => o && setQ('')}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} data-testid="grid-actions">
          {t('ie.grid.actions')}
          {selectedCount > 0 && <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-[10px]">{selectedCount}</span>}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={t('ie.grid.searchOrSelect')}
          className="mb-1 h-8"
        />
        {items.map((i) => (
          <DropdownMenuItem key={i.id} onClick={i.run} data-testid={`grid-action-${i.id}`}>
            <i.icon className="mr-2 h-3.5 w-3.5" />
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterPicker({ columns, rows, onPick }: { columns: GridColumn[]; rows: GridRow[]; onPick: (column: string, value: string) => void }) {
  const { t } = useTranslation()
  const [column, setColumn] = useState(columns.find((c) => c.key === 'status')?.key ?? columns[0]?.key ?? '')
  const values = useMemo(() => distinctValues(rows, column), [rows, column])
  return (
    <div className="space-y-2">
      <select className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm" value={column} onChange={(e) => setColumn(e.target.value)}>
        {columns.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="max-h-56 overflow-y-auto">
        {values.map((v) => (
          <button
            key={v.value}
            type="button"
            className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent/15"
            onClick={() => onPick(column, v.value)}
          >
            <span className="truncate">{v.value || <em className="text-muted-foreground">{t('ie.grid.empty')}</em>}</span>
            <span className="text-xs text-muted-foreground">{v.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ColumnActionDialog({
  dialog,
  rows,
  onClose,
  onApply,
  onFilter,
}: {
  dialog: ColumnDialog
  rows: GridRow[]
  onClose: () => void
  onApply: (rows: GridRow[], changed: number) => void
  onFilter: (column: string, value: string) => void
}) {
  const { t } = useTranslation()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const open = dialog !== null
  const title = !dialog
    ? ''
    : dialog.kind === 'findReplace'
      ? t('ie.grid.findReplace')
      : dialog.kind === 'replaceEmpty'
        ? t('ie.grid.replaceEmpty')
        : t('ie.grid.filterByValue')
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
        setFind('')
        setReplace('')
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {title}
            {dialog && <span className="ml-1 font-normal text-muted-foreground">· {dialog.column.label}</span>}
          </DialogTitle>
        </DialogHeader>
        {dialog?.kind === 'filterValue' ? (
          <FilterPicker columns={[dialog.column]} rows={rows} onPick={onFilter} />
        ) : (
          <div className="space-y-2">
            {dialog?.kind === 'findReplace' && <Input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('ie.grid.find')} />}
            <Input
              autoFocus={dialog?.kind === 'replaceEmpty'}
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder={t('ie.grid.replaceWith')}
            />
          </div>
        )}
        {dialog && dialog.kind !== 'filterValue' && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('ie.cancel')}
            </Button>
            <Button
              disabled={dialog.kind === 'findReplace' && !find}
              onClick={() => {
                const res = dialog.kind === 'findReplace' ? findAndReplace(rows, dialog.column.key, find, replace) : replaceEmpty(rows, dialog.column.key, replace)
                onApply(res.rows, res.changed)
              }}
            >
              {t('ie.apply')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
