import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Input,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@rundesk/ui'
import {
  Trash2,
  RotateCcw,
  Search,
  Filter,
  MoreHorizontal,
  Layers,
  Folder,
  FolderKanban,
  List as ListIcon,
  CheckSquare,
  FileText,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { useDateFormat } from '../lib/date-format'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { InlineSkeleton } from './loading-skeletons'

type TrashType = 'space' | 'folder' | 'project' | 'list' | 'task' | 'doc'

type TrashItem = {
  id: string
  type: TrashType
  name: string
  location: string
  deletedAt: string | null
  deletedBy: { id: string; name: string; avatarUrl: string | null } | null
}

type TrashResponse = { items: TrashItem[]; retentionDays: number; types: TrashType[] }
type Deleter = { id: string; name: string; avatarUrl: string | null }

// Every type the workspace Trash can hold, with the icon + label used in the
// Type column and the Type filter. Order mirrors the container hierarchy.
const TYPE_META: { value: TrashType; labelKey: TranslationKey; icon: typeof Folder }[] = [
  { value: 'space', labelKey: 'trash.typeSpace', icon: Layers },
  { value: 'folder', labelKey: 'trash.typeFolder', icon: Folder },
  { value: 'project', labelKey: 'trash.typeProject', icon: FolderKanban },
  { value: 'list', labelKey: 'trash.typeList', icon: ListIcon },
  { value: 'task', labelKey: 'trash.typeTask', icon: CheckSquare },
  { value: 'doc', labelKey: 'trash.typeDoc', icon: FileText },
]

export function TrashTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { formatDateTime } = useDateFormat()
  const { isAdmin, isManagerOrAbove } = useWorkspaceRole(workspaceId)
  const canEmpty = isAdmin || isManagerOrAbove

  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<TrashType[]>([])
  const [deletedBy, setDeletedBy] = useState<string[]>([])

  const params = new URLSearchParams()
  if (types.length) params.set('types', types.join(','))
  if (deletedBy.length) params.set('deletedBy', deletedBy.join(','))
  const qs = params.toString()

  const trashQuery = useQuery({
    queryKey: ['trash', workspaceId, types.join(','), deletedBy.join(',')],
    queryFn: () => api<TrashResponse>(`/workspaces/${workspaceId}/trash${qs ? `?${qs}` : ''}`),
  })
  const deletersQuery = useQuery({
    queryKey: ['trash-deleters', workspaceId],
    queryFn: () => api<Deleter[]>(`/workspaces/${workspaceId}/trash/deleters`),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['trash', workspaceId] })
    qc.invalidateQueries({ queryKey: ['trash-deleters', workspaceId] })
    // Everything the restored item could reappear in.
    for (const key of ['spaces', 'space-tree', 'projects', 'folders', 'lists', 'tasks', 'docs']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
  const failed = (err: unknown, fallback: TranslationKey) =>
    toast.error(err instanceof ApiError ? err.message : t(fallback))

  const restore = useMutation({
    mutationFn: (item: TrashItem) =>
      api(`/workspaces/${workspaceId}/trash/${item.type}/${item.id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('trash.restored'))
      refresh()
    },
    onError: (e) => failed(e, 'trash.restoreFailed'),
  })

  const deleteForever = useMutation({
    mutationFn: (item: TrashItem) =>
      api(`/workspaces/${workspaceId}/trash/${item.type}/${item.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('trash.deletedForever'))
      refresh()
    },
    onError: (e) => failed(e, 'trash.deleteFailed'),
  })

  const clearAll = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/trash`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('trash.cleared'))
      refresh()
    },
    onError: (e) => failed(e, 'trash.deleteFailed'),
  })


  const retentionDays = trashQuery.data?.retentionDays ?? 30
  const allItems = useMemo(() => trashQuery.data?.items ?? [], [trashQuery.data])
  // Name/location search runs client-side so typing filters instantly without a
  // round-trip; the server applies the same rule for any direct API use.
  const items = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return allItems
    return allItems.filter(
      (i) => i.name.toLowerCase().includes(term) || i.location.toLowerCase().includes(term),
    )
  }, [allItems, search])

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  const activeFilters = types.length + deletedBy.length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{t('trash.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('trash.retentionNotice', { days: retentionDays })}
          </p>
        </div>
        {canEmpty && items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
            disabled={clearAll.isPending}
            onClick={() => {
              if (window.confirm(t('trash.clearAllConfirm', { count: allItems.length }))) clearAll.mutate()
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {clearAll.isPending ? t('trash.clearing') : t('trash.clearAll')}
          </Button>
        )}
      </div>

      {/* Search + Type + Deleted-by filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('trash.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {t('trash.filterType')}
              {types.length > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 text-[11px] tabular-nums">{types.length}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {TYPE_META.map((m) => (
              <DropdownMenuItem
                key={m.value}
                onSelect={(e) => {
                  e.preventDefault()
                  setTypes((cur) => toggle(cur, m.value))
                }}
              >
                <m.icon className="h-3.5 w-3.5" />
                <span className="flex-1">{t(m.labelKey)}</span>
                {types.includes(m.value) && <span className="text-accent">✓</span>}
              </DropdownMenuItem>
            ))}
            {types.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTypes([])}>{t('trash.clearFilter')}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              {t('trash.filterDeletedBy')}
              {deletedBy.length > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/20 px-1.5 text-[11px] tabular-nums">{deletedBy.length}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
            {(deletersQuery.data ?? []).length === 0 ? (
              <div className="px-2 py-2 text-[13px] text-muted-foreground">{t('trash.noDeleters')}</div>
            ) : (
              (deletersQuery.data ?? []).map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    setDeletedBy((cur) => toggle(cur, d.id))
                  }}
                >
                  <span className="flex-1 truncate">{d.name}</span>
                  {deletedBy.includes(d.id) && <span className="text-accent">✓</span>}
                </DropdownMenuItem>
              ))
            )}
            {deletedBy.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDeletedBy([])}>{t('trash.clearFilter')}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setTypes([])
              setDeletedBy([])
            }}
          >
            {t('trash.clearFilter')}
          </Button>
        )}
      </div>

      {/* Items */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {/* table-fixed so the column widths below are honoured and long names
              /locations truncate instead of stretching the table. */}
          <table className="w-full table-fixed text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="w-[30%] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('trash.colName')}
                </th>
                <th className="w-[11%] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('trash.colType')}
                </th>
                <th className="w-[25%] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('trash.colLocation')}
                </th>
                <th className="w-[17%] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('trash.colDeletedOn')}
                </th>
                <th className="w-[13%] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('trash.colDeletedBy')}
                </th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {trashQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <InlineSkeleton />
                  </td>
                </tr>
              )}
              {!trashQuery.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <Trash2 className="h-5 w-5 mx-auto mb-2 opacity-50" />
                    {t('trash.empty')}
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const meta = TYPE_META.find((m) => m.value === item.type)
                const Icon = meta?.icon ?? Folder
                return (
                  <tr key={`${item.type}:${item.id}`} className="hover:bg-accent/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <span className="block truncate">{meta ? t(meta.labelKey) : item.type}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <span className="block truncate">{item.location || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                      <span className="block truncate">{item.deletedAt ? formatDateTime(item.deletedAt) : '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <span className="block truncate">{item.deletedBy?.name ?? '—'}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-accent/15 hover:text-foreground flex items-center justify-center"
                            aria-label={t('nav.actionsFor', { name: item.name })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            disabled={restore.isPending}
                            onClick={() => restore.mutate(item)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {t('trash.restore')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={deleteForever.isPending}
                            onClick={() => {
                              if (window.confirm(t('trash.deleteForeverConfirm', { name: item.name }))) {
                                deleteForever.mutate(item)
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('trash.deleteForever')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  )
}
