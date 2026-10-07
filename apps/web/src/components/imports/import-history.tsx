/**
 * §7 — Import history: every import (the engine's and the older importers')
 * and every export, newest first, with live status, View details, and the
 * kebab's Cancel, Delete, Download file and Copy ID.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, FileUp, LifeBuoy, MoreHorizontal, Trash2, XCircle } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PersonAvatar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toast,
} from '@rundesk/ui'
import { refusalMessage } from '../../lib/api'
import { useTranslation, type TranslationKey } from '../../lib/i18n'
import { exportsApi, importsApi, type HistoryRow } from '../../lib/imports-exports-api'
import { InlineSkeleton } from '../loading-skeletons'
import { CSV_SOURCES, isCsvSource } from '@rundesk/imports'
import { AppMark, sourceMark } from './source-grid'

const SOURCE_KEYS: Record<string, TranslationKey> = {
  spreadsheet: 'ie.source.spreadsheet',
  clickup_csv: 'ie.source.clickup',
  export: 'ie.source.export',
}

const PHASE_KEYS: Record<string, TranslationKey> = {
  queued: 'ie.phase.queued',
  validating: 'ie.phase.validating',
  creating_lists: 'ie.phase.creatingLists',
  creating_fields: 'ie.phase.creatingFields',
  creating_tasks: 'ie.phase.creatingTasks',
  finalising: 'ie.phase.finalising',
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  pending: 'ie.status.queued',
  processing: 'ie.status.pending',
  completed: 'ie.status.completed',
  failed: 'ie.status.failed',
  cancelled: 'ie.status.cancelled',
  deleted: 'ie.status.deleted',
}

const fmt = (n: number) => n.toLocaleString('en-GB')

/** "Asana" for an Asana export, else the importer's own name. */
function sourceName(row: HistoryRow, t: (key: TranslationKey) => string): string {
  if (row.sourcePreset && isCsvSource(row.sourcePreset)) return CSV_SOURCES[row.sourcePreset].label
  return SOURCE_KEYS[row.source] ? t(SOURCE_KEYS[row.source]) : row.source
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export function StatusChip({ row }: { row: HistoryRow }) {
  const { t } = useTranslation()
  const tone =
    row.status === 'completed'
      ? 'bg-success/15 text-success'
      : row.status === 'failed'
        ? 'bg-destructive/15 text-destructive'
        : row.status === 'processing'
          ? 'bg-accent/15 text-accent'
          : 'bg-muted text-muted-foreground'
  const label =
    row.kind === 'export'
      ? row.status === 'completed'
        ? t('ie.status.completed')
        : row.status === 'failed'
          ? t('ie.status.exportFailed')
          : t('ie.status.exportPending')
      : STATUS_KEYS[row.status]
        ? t(STATUS_KEYS[row.status])
        : row.statusLabel
  const pct = row.total > 0 ? Math.min(100, Math.round((row.processed / row.total) * 100)) : 0
  return (
    <div className="space-y-0.5">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', tone, row.status === 'deleted' && 'line-through')} data-testid={`history-status-${row.id}`}>
        {label}
        {row.kind === 'import' && row.status === 'processing' && <span>{pct}%</span>}
      </span>
      {row.kind === 'import' && row.status === 'processing' && row.phase && (
        <div className="text-[11px] text-muted-foreground" data-testid={`history-phase-${row.id}`}>
          {row.phase === 'creating_tasks'
            ? t('ie.phase.creatingTasks', { done: fmt(row.processed), total: fmt(row.total) })
            : PHASE_KEYS[row.phase]
              ? t(PHASE_KEYS[row.phase])
              : row.phase}
        </div>
      )}
    </div>
  )
}

export function ImportHistory({
  workspaceId,
  items,
  loading,
  onNewImport,
  onOpen,
}: {
  workspaceId: string
  items: HistoryRow[]
  loading: boolean
  onNewImport: () => void
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<HistoryRow | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['imports-history', workspaceId] })

  const cancel = useMutation({
    mutationFn: (id: string) => importsApi.cancel(workspaceId, id),
    onSuccess: () => {
      toast.success(t('ie.cancelled'))
      refresh()
    },
    onError: (e) => toast.error(refusalMessage(e, t('ie.couldNotCancel'))),
  })

  const download = async (row: HistoryRow) => {
    try {
      if (row.kind === 'export') {
        const state = await exportsApi.status(workspaceId, row.id)
        if (!state.download) return toast.error(t('ie.export.expired'))
        window.location.href = state.download.url
      } else {
        await importsApi.sourceFile(workspaceId, row.id)
      }
    } catch (e) {
      toast.error(refusalMessage(e, t('ie.couldNotDownload')))
    }
  }

  const copyId = (row: HistoryRow) => {
    void navigator.clipboard?.writeText(row.supportReference)
    toast.success(t('ie.copiedId', { id: row.supportReference }))
  }

  return (
    <div data-testid="import-history">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{t('ie.history.title')}</h3>
        <Button onClick={onNewImport} data-testid="history-new-import">
          <FileUp className="mr-1.5 h-4 w-4" />
          {t('ie.importItems')}
        </Button>
      </div>
      <TooltipProvider delayDuration={150}>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">{t('ie.history.status')}</th>
                <th className="px-3 py-2 font-semibold">{t('ie.history.source')}</th>
                <th className="px-3 py-2 font-semibold">{t('ie.history.by')}</th>
                <th className="px-3 py-2 font-semibold">{t('ie.history.started')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('ie.history.items')}</th>
                <th className="px-3 py-2 font-semibold">
                  <span className="sr-only">{t('ie.history.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-3">
                    <InlineSkeleton />
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="border-t border-border/40" data-testid={`history-row-${row.id}`}>
                  <td className="px-3 py-2 align-top">
                    <StatusChip row={row} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center gap-1.5">
                      {row.kind === 'export' ? <Download className="h-4 w-4 text-muted-foreground" /> : <AppMark mark={sourceMark(row.source, row.sourcePreset)} className="h-4 w-4" />}
                      {sourceName(row, t)}
                    </span>
                    {row.fileName && <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{row.fileName}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.by ? (
                      <span className="inline-flex items-center gap-1.5">
                        <PersonAvatar name={row.by.name ?? '?'} imageUrl={row.by.avatarUrl} size="xs" />
                        {row.by.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">{when(row.startedAt)}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{fmt(row.itemsImported ?? 0)}</td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      {row.kind === 'import' && (
                        <Button variant="ghost" size="sm" onClick={() => onOpen(row.id)} data-testid={`history-view-${row.id}`}>
                          {t('ie.history.viewDetails')}
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={t('ie.history.actions')} data-testid={`history-menu-${row.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {row.cancellable && (
                            <DropdownMenuItem onClick={() => cancel.mutate(row.id)} data-testid={`history-cancel-${row.id}`}>
                              <XCircle className="mr-2 h-3.5 w-3.5" />
                              {t('ie.history.cancel')}
                            </DropdownMenuItem>
                          )}
                          {row.kind === 'import' && ['completed', 'failed', 'cancelled'].includes(row.status) && (
                            row.deletable ? (
                              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(row)} data-testid={`history-delete-${row.id}`}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                {t('ie.history.delete')}
                              </DropdownMenuItem>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <DropdownMenuItem disabled data-testid={`history-delete-${row.id}`}>
                                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                                      {t('ie.history.delete')}
                                    </DropdownMenuItem>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                  {t('ie.history.deleteExpired')}
                                </TooltipContent>
                              </Tooltip>
                            )
                          )}
                          {(row.kind === 'import' ? row.source === 'spreadsheet' && Boolean(row.phase) : row.status === 'completed') && (
                            <DropdownMenuItem onClick={() => void download(row)}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              {t('ie.history.downloadFile')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => copyId(row)}>
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            {t('ie.history.copyId')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
      <DeleteImportDialog workspaceId={workspaceId} row={confirmDelete} onClose={() => setConfirmDelete(null)} onDeleted={refresh} />
    </div>
  )
}

function DeleteImportDialog({ workspaceId, row, onClose, onDeleted }: { workspaceId: string; row: HistoryRow | null; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const report = useQuery({
    queryKey: ['import-report', workspaceId, row?.id],
    queryFn: () => importsApi.report(workspaceId, row!.id),
    enabled: Boolean(row),
  })
  const remove = useMutation({
    mutationFn: () => importsApi.remove(workspaceId, row!.id),
    onSuccess: (res) => {
      toast.success(t('ie.deleted', { count: res.deleted?.tasks ?? 0 }))
      onDeleted()
      onClose()
    },
    onError: (e) => toast.error(refusalMessage(e, t('ie.couldNotDelete'))),
  })
  const c = report.data?.report?.counts ?? {}
  const parts = (
    [
      ['tasksCreated', 'ie.count.tasks'],
      ['subtasksCreated', 'ie.count.subtasks'],
      ['listsCreated', 'ie.count.lists'],
      ['projectsCreated', 'ie.count.projects'],
      ['fieldsCreated', 'ie.count.fields'],
      ['tagsCreated', 'ie.count.tags'],
      ['statusesCreated', 'ie.count.statuses'],
    ] as Array<[string, TranslationKey]>
  ).filter(([k]) => (c[k] ?? 0) > 0)
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="delete-import-dialog">
        <DialogHeader>
          <DialogTitle>{t('ie.delete.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('ie.delete.body')}</p>
        {report.isLoading ? (
          <InlineSkeleton />
        ) : (
          parts.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {parts.map(([k, label]) => (
                <li key={k}>{t(label, { count: fmt(c[k] ?? 0) })}</li>
              ))}
            </ul>
          )
        )}
        <p className="text-xs text-muted-foreground">{t('ie.delete.trashNote')}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('ie.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending} data-testid="delete-import-confirm">
            {t('ie.history.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** §7 View details: header, summary tiles, and Items / Users / Errors / Settings. */
export function ImportDetailsDialog({ workspaceId, id, onClose }: { workspaceId: string; id: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const report = useQuery({
    queryKey: ['import-report', workspaceId, id, q],
    queryFn: () => importsApi.report(workspaceId, id!, q || undefined),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && ['pending', 'processing'].includes(query.state.data.status) ? 5_000 : false),
  })
  const r = report.data
  const counts = r?.report?.counts ?? {}
  const tiles: Array<[string, TranslationKey]> = [
    ['tasksCreated', 'ie.tile.tasks'],
    ['subtasksCreated', 'ie.tile.subtasks'],
    ['tasksSkipped', 'ie.tile.skipped'],
    ['tasksFailed', 'ie.tile.failed'],
    ['listsCreated', 'ie.tile.lists'],
    ['fieldsCreated', 'ie.tile.fields'],
    ['tagsCreated', 'ie.tile.tags'],
    ['statusesCreated', 'ie.tile.statuses'],
  ]
  const duration = r?.report?.durationMs ? `${Math.max(1, Math.round(r.report.durationMs / 1000))}s` : '—'
  const opts = (r?.settings.options ?? {}) as { dateFormat?: string; delimiter?: string }
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" data-testid="import-details">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle>{t('ie.details.title')}</DialogTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" asChild>
                <a href="/app/help" data-testid="details-support">
                  <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
                  {t('ie.details.contactSupport')}
                </a>
              </Button>
              {r && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(r.supportReference)
                    toast.success(t('ie.copiedId', { id: r.supportReference }))
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {t('ie.history.copyId')}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        {!r ? (
          <InlineSkeleton />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">{t('ie.details.source')}:</span> {sourceName(r, t)}
                {r.fileName && <span className="text-muted-foreground"> · {r.fileName}</span>}
              </div>
              <div>
                <span className="text-muted-foreground">{t('ie.details.by')}:</span> {r.by?.name ?? '—'}
              </div>
              <div>
                <span className="text-muted-foreground">{t('ie.details.when')}:</span> {when(r.startedAt)}
              </div>
              <div>
                <span className="text-muted-foreground">{t('ie.details.duration')}:</span> {duration}
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">{t('ie.details.destination')}:</span> {r.report?.destination?.path ?? '—'}
              </div>
              <div className="sm:col-span-2">
                <StatusChip row={r} />
                {r.error && <p className="mt-1 text-sm text-destructive">{r.error}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map(([k, label]) => (
                <div key={k} className="rounded-lg border border-border/60 bg-card/50 p-3">
                  <div className="text-xl font-semibold tabular-nums">{fmt(counts[k] ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">{t(label)}</div>
                </div>
              ))}
            </div>
            <Tabs defaultValue="items">
              <TabsList>
                <TabsTrigger value="items">{t('ie.details.items')}</TabsTrigger>
                <TabsTrigger value="users">{t('ie.details.users')}</TabsTrigger>
                <TabsTrigger value="errors">
                  {t('ie.details.errors')} {r.errorCount > 0 && `(${fmt(r.errorCount)})`}
                </TabsTrigger>
                <TabsTrigger value="settings">{t('ie.details.settings')}</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="space-y-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ie.search')} className="h-8 max-w-xs" />
                <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
                  {r.items.length === 0 && <div className="p-3 text-sm text-muted-foreground">{t('ie.details.noItems')}</div>}
                  {r.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 text-sm last:border-0">
                      <span className="w-20 shrink-0 text-[11px] uppercase text-muted-foreground">{it.entityType.replace('_', ' ')}</span>
                      {it.url ? (
                        <a href={it.url} className="truncate text-accent hover:underline">
                          {it.message ?? it.sourceRef}
                        </a>
                      ) : (
                        <span className={cn('truncate', it.action === 'failed' && 'text-destructive')}>{it.message ?? it.sourceRef}</span>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="users">
                <div className="rounded-md border border-border/60">
                  {(r.report?.users ?? []).length === 0 && <div className="p-3 text-sm text-muted-foreground">{t('ie.details.noUsers')}</div>}
                  {(r.report?.users ?? []).map((u) => (
                    <div key={u.value} className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-1.5 text-sm last:border-0">
                      <span className="truncate">{u.value}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(u.outcome === 'matched' ? 'ie.user.matched' : u.outcome === 'invited' ? 'ie.user.invited' : 'ie.user.skipped')}
                        {u.name && u.outcome === 'matched' ? ` · ${u.name}` : ''}
                        {u.note && u.outcome !== 'matched' ? ` · ${u.note}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="errors" className="space-y-2">
                {r.errorCount > 0 && (
                  <Button variant="outline" size="sm" onClick={() => void importsApi.errorsCsv(workspaceId, r.id)} data-testid="details-errors-csv">
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {t('ie.details.downloadErrors')}
                  </Button>
                )}
                <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
                  {r.errors.length === 0 && !r.legacyRowErrors?.length && <div className="p-3 text-sm text-muted-foreground">{t('ie.details.noErrors')}</div>}
                  {r.errors.map((e, i) => (
                    <div key={i} className="grid grid-cols-[90px_120px_1fr] gap-2 border-b border-border/30 px-3 py-1.5 text-sm last:border-0">
                      <span className="text-muted-foreground">{e.rowRef ?? '—'}</span>
                      <span className="truncate text-muted-foreground">{e.field ?? ''}</span>
                      <span className={e.severity === 'error' ? 'text-destructive' : ''}>{e.message}</span>
                    </div>
                  ))}
                  {(r.legacyRowErrors ?? []).map((e, i) => (
                    <div key={`l${i}`} className="grid grid-cols-[90px_1fr] gap-2 border-b border-border/30 px-3 py-1.5 text-sm last:border-0">
                      <span className="text-muted-foreground">{t('ie.details.row', { row: e.row })}</span>
                      <span className="text-destructive">{e.message}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="settings">
                <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t('ie.details.dateFormat')}</dt>
                  <dd>{opts.dateFormat ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('ie.details.delimiter')}</dt>
                  <dd>{opts.delimiter ? `"${opts.delimiter}"` : '—'}</dd>
                  {Object.entries(r.settings.mapping ?? {}).map(([h, target]) => (
                    <div key={h} className="contents">
                      <dt className="truncate text-muted-foreground">{h}</dt>
                      <dd className="truncate">{target}</dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
