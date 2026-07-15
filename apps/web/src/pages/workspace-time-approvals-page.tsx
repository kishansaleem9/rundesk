import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Button,
  Badge,
  PersonAvatar,
  EmptyState,
  Textarea,
  cn,
} from '@rundesk/ui'
import {
  Check,
  X,
  Clock,
  ChevronRight,
  ChevronDown,
  CheckCheck,
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type Timesheet = {
  id: string
  name: string
  weekOf: string
  total: number // hours
  billable: number
  status: 'pending' | 'submitted' | 'approved' | 'rejected'
  approvedAt?: string | null
  approvedById?: string | null
  reviewerName?: string | null
  reviewerEmail?: string | null
  rejectionReason?: string
  entries: Array<{ project: string; hours: number; billable: boolean; note?: string }>
}
function parseSheetId(id: string): { userId: string; weekStart: string } | null {
  const split = id.split(':')
  if (split.length !== 2) return null
  return { userId: split[0], weekStart: split[1] }
}

function isCurrentWeek(weekOfLabel: string) {
  const [, endRaw] = weekOfLabel.split(' — ')
  if (!endRaw) return false
  const end = new Date(endRaw)
  if (Number.isNaN(end.getTime())) return false
  const now = new Date()
  return end >= now
}

function historyFilterLabel(filter: 'all' | 'approved' | 'rejected' | 'this_week'): TranslationKey {
  if (filter === 'all') return 'timeApprovals.filter.all'
  if (filter === 'approved') return 'timeApprovals.filter.approved'
  if (filter === 'rejected') return 'timeApprovals.filter.rejected'
  return 'timeApprovals.filter.thisWeek'
}

type ApprovalsTab = 'pending' | 'history'
type ApprovalsHistoryFilter = 'all' | 'approved' | 'rejected' | 'this_week'

export function TimeApprovalsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/time/approvals' })
  const search = useSearch({ from: '/app/$workspaceId/time/approvals' }) as { tab: ApprovalsTab; historyFilter: ApprovalsHistoryFilter }
  const navigate = useNavigate()
  const historyFilterStorageKey = `rundesk.time-approvals.history-filter.${workspaceId}`
  const qc = useQueryClient()
  const [tab, setTab] = useState<ApprovalsTab>(search.tab)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<ApprovalsHistoryFilter>(
    search.historyFilter,
  )

  const approvalsQuery = useQuery({
    queryKey: ['time-approvals', workspaceId],
    queryFn: async () => {
      try {
        setAccessDenied(false)
        return await api<{ canModerate: boolean; items: Timesheet[] }>(
          `/workspaces/${workspaceId}/time-approvals`,
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          setAccessDenied(true)
        }
        return { canModerate: false, items: [] as Timesheet[] }
      }
    },
  })
  const canModerateApprovals = approvalsQuery.data?.canModerate ?? false
  const allSheets = approvalsQuery.data?.items ?? []
  // "Pending" holds everything still awaiting a decision: auto-generated drafts
  // ('pending') and timesheets a member has explicitly submitted ('submitted').
  const pending = allSheets.filter((m) => m.status === 'pending' || m.status === 'submitted')
  const history = allSheets.filter((m) => m.status === 'approved' || m.status === 'rejected')
  const historyCounts = useMemo(
    () => ({
      all: history.length,
      approved: history.filter((sheet) => sheet.status === 'approved').length,
      rejected: history.filter((sheet) => sheet.status === 'rejected').length,
      this_week: history.filter((sheet) => isCurrentWeek(sheet.weekOf)).length,
    }),
    [history],
  )
  const filteredHistory = history.filter((sheet) => {
    if (historyFilter === 'all') return true
    if (historyFilter === 'approved') return sheet.status === 'approved'
    if (historyFilter === 'rejected') return sheet.status === 'rejected'
    return isCurrentWeek(sheet.weekOf)
  })
  const list = tab === 'pending' ? pending : filteredHistory

  useEffect(() => {
    setTab(search.tab)
  }, [search.tab])

  useEffect(() => {
    setHistoryFilter(search.historyFilter)
  }, [search.historyFilter])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (search.historyFilter !== 'all') return
    const raw = window.localStorage.getItem(historyFilterStorageKey)
    if (!raw) return
    if (raw === 'all' || raw === 'approved' || raw === 'rejected' || raw === 'this_week') {
      setHistoryFilter(raw)
    }
  }, [historyFilterStorageKey, search.historyFilter])

  useEffect(() => {
    if (tab === search.tab && historyFilter === search.historyFilter) return
    navigate({
      to: '/app/$workspaceId/time/approvals',
      params: { workspaceId },
      search: { tab, historyFilter },
      replace: true,
    })
  }, [historyFilter, navigate, search.historyFilter, search.tab, tab, workspaceId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(historyFilterStorageKey, historyFilter)
  }, [historyFilter, historyFilterStorageKey])

  useEffect(() => {
    if (pending.length === 0) {
      setExpanded(new Set())
      return
    }
    setExpanded(new Set([pending[0].id]))
  }, [pending.length])

  const approveMutation = useMutation({
    mutationFn: async ({ userId, weekStart }: { userId: string; weekStart: string }) =>
      api(`/workspaces/${workspaceId}/time-approvals/${userId}/${weekStart}/approve`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['time-approvals', workspaceId] })
    },
  })
  const rejectMutation = useMutation({
    mutationFn: async ({ userId, weekStart, rejectReason }: { userId: string; weekStart: string; rejectReason: string }) =>
      api(`/workspaces/${workspaceId}/time-approvals/${userId}/${weekStart}/reject`, {
        method: 'POST',
        body: { reason: rejectReason },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['time-approvals', workspaceId] })
    },
  })

  const selectedIds = useMemo(() => [...selected], [selected])
  const selectedTimesheets = useMemo(() => list.filter((item) => selected.has(item.id)), [list, selected])

  const approveSelected = async () => {
    const targets = selectedTimesheets
      .map((item) => parseSheetId(item.id))
      .filter((item): item is { userId: string; weekStart: string } => Boolean(item))
    if (targets.length === 0) return
    await Promise.all(targets.map((target) => approveMutation.mutateAsync(target)))
    setSelected(new Set())
  }
  const rejectSelected = async () => {
    const trimmed = reason.trim()
    if (!trimmed) return
    const targets = selectedTimesheets
      .map((item) => parseSheetId(item.id))
      .filter((item): item is { userId: string; weekStart: string } => Boolean(item))
    if (targets.length === 0) return
    await Promise.all(targets.map((target) => rejectMutation.mutateAsync({ ...target, rejectReason: trimmed })))
    setSelected(new Set())
    setReason('')
    setRejecting(null)
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          {t('timeApprovals.eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          {t('timeApprovals.title')}
          <Badge variant={canModerateApprovals ? 'success' : 'secondary'} className="ml-1 text-[10px] uppercase">
            {canModerateApprovals ? t('timeApprovals.adminReviewer') : t('timeApprovals.readOnly')}
          </Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {canModerateApprovals
            ? t('timeApprovals.subtitleMod')
            : t('timeApprovals.subtitleView')}
        </p>
      </header>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
          <button
            onClick={() => setTab('pending')}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
              tab === 'pending'
                ? 'bg-brand-gradient text-white shadow-sm'
                : 'hover:bg-card/60 text-muted-foreground',
            )}
          >
            {t('timeApprovals.pendingTab', { count: pending.length })}
          </button>
          <button
            onClick={() => setTab('history')}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
              tab === 'history'
                ? 'bg-brand-gradient text-white shadow-sm'
                : 'hover:bg-card/60 text-muted-foreground',
            )}
          >
            {t('timeApprovals.historyTab', { count: history.length })}
          </button>
        </div>
        {tab === 'history' ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
              {(['all', 'approved', 'rejected', 'this_week'] as const).map((filterId) => (
                <button
                  key={filterId}
                  onClick={() => setHistoryFilter(filterId)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
                    historyFilter === filterId
                      ? 'bg-brand-gradient text-white shadow-sm'
                      : 'hover:bg-card/60 text-muted-foreground',
                  )}
                >
                  {t(historyFilterLabel(filterId))} ({historyCounts[filterId]})
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHistoryFilter('all')
                if (typeof window !== 'undefined') {
                  window.localStorage.removeItem(historyFilterStorageKey)
                }
              }}
              disabled={historyFilter === 'all'}
            >
              {t('timeApprovals.reset')}
            </Button>
          </div>
        ) : null}
        {tab === 'pending' && canModerateApprovals && selected.size > 0 && (
          <div className="flex items-center gap-2 animate-fade-in">
            <span className="text-xs text-muted-foreground">{tCount('timeApprovals.selected', selected.size)}</span>
            <Button variant="outline" size="sm" onClick={() => setRejecting('bulk')}>
              <X className="h-3.5 w-3.5" /> {t('timeApprovals.reject')}
            </Button>
            <Button variant="gradient" size="sm" onClick={approveSelected} disabled={approveMutation.isPending}>
              <CheckCheck className="h-3.5 w-3.5" /> {t('timeApprovals.approveAll')}
            </Button>
          </div>
        )}
      </div>
      {!canModerateApprovals && pending.length > 0 ? (
        <Card className="p-3 border-border/60 bg-card/40 text-xs text-muted-foreground">
          {t('timeApprovals.readOnlyNote')}
        </Card>
      ) : null}

      {list.length === 0 ? (
        tab === 'history' && history.length > 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('timeApprovals.noResultsTitle')}
            description={t('timeApprovals.noFilterResults', { filter: t(historyFilterLabel(historyFilter)) })}
          />
        ) : (
        accessDenied || !canModerateApprovals ? (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('timeApprovals.adminRequiredTitle')}
            description={t('timeApprovals.adminRequiredDesc')}
          />
        ) : (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('timeApprovals.emptyTitle')}
            description={tab === 'pending' ? t('timeApprovals.emptyPending') : t('timeApprovals.emptyHistory')}
          />
        )
        )
      ) : (
        <div className="space-y-2.5">
          {list.map((sheet) => (
            <Card key={sheet.id} variant="glass" className="overflow-hidden p-0">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-card/40 transition-colors"
                onClick={() => toggleExpand(sheet.id)}
              >
                {tab === 'pending' && canModerateApprovals && (
                  <input
                    type="checkbox"
                    checked={selected.has(sheet.id)}
                    onChange={() => toggleSelect(sheet.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded"
                  />
                )}
                <PersonAvatar name={sheet.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sheet.name}</span>
                    {sheet.status === 'pending' && (
                      <Badge variant="secondary" className="text-[9px] uppercase">{t('timeApprovals.status.draft')}</Badge>
                    )}
                    {sheet.status === 'submitted' && (
                      <Badge variant="warning" className="text-[9px] uppercase">{t('timeApprovals.status.submitted')}</Badge>
                    )}
                    {sheet.status === 'approved' && (
                      <Badge variant="success" className="text-[9px] uppercase">
                        <Check className="h-2.5 w-2.5" /> {t('timeApprovals.status.approved')}
                      </Badge>
                    )}
                    {sheet.status === 'rejected' && (
                      <Badge variant="destructive" className="text-[9px] uppercase">
                        <AlertTriangle className="h-2.5 w-2.5" /> {t('timeApprovals.status.rejected')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {t('timeApprovals.weekOf', { week: sheet.weekOf })}
                    <span>·</span>
                    <span className="text-foreground tabular-nums">{sheet.total}h</span>
                    <span className="text-success tabular-nums">{t('timeApprovals.billableHours', { hours: sheet.billable })}</span>
                  </div>
                  {sheet.status !== 'pending' && (sheet.approvedAt || sheet.approvedById) ? (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t('timeApprovals.lastReviewed')}
                      {sheet.approvedAt ? ` ${new Date(sheet.approvedAt).toLocaleString()}` : ''}
                      {sheet.approvedById
                        ? ` ${t('timeApprovals.byPerson', { name: sheet.reviewerName || sheet.reviewerEmail || sheet.approvedById })}`
                        : ''}
                    </div>
                  ) : null}
                </div>
                {tab === 'pending' && canModerateApprovals && (
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(sheet.id)}>
                      <X className="h-3.5 w-3.5" /> {t('timeApprovals.reject')}
                    </Button>
                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={async () => {
                        const parsed = parseSheetId(sheet.id)
                        if (!parsed) return
                        await approveMutation.mutateAsync(parsed)
                      }}
                      disabled={approveMutation.isPending}
                    >
                      <Check className="h-3.5 w-3.5" /> {t('timeApprovals.approve')}
                    </Button>
                  </div>
                )}
                {expanded.has(sheet.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>

              {expanded.has(sheet.id) && (
                <div className="border-t border-border/30 bg-card/20 p-4 space-y-2 animate-fade-in">
                  {(sheet.approvedAt || sheet.approvedById) && (
                    <div className="rounded-md border border-border/40 bg-card/40 p-2.5 text-xs text-muted-foreground">
                      {t('timeApprovals.reviewed')}
                      {sheet.approvedAt ? ` ${t('timeApprovals.atTime', { time: new Date(sheet.approvedAt).toLocaleString() })}` : ''}
                      {sheet.approvedById
                        ? ` ${t('timeApprovals.byPerson', { name: sheet.reviewerName || sheet.reviewerEmail || sheet.approvedById })}`
                        : ''}
                    </div>
                  )}
                  {sheet.rejectionReason && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
                      <span className="font-medium text-destructive">{t('timeApprovals.rejectionReasonLabel')} </span>
                      {sheet.rejectionReason}
                    </div>
                  )}
                  <ul className="divide-y divide-border/30">
                    {sheet.entries.map((e, i) => (
                      <li key={i} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="truncate">{e.project}</div>
                          {e.note && <div className="text-xs text-muted-foreground truncate">{e.note}</div>}
                        </div>
                        {e.billable && (
                          <Badge variant="success" className="text-[9px] uppercase">{t('timeApprovals.billable')}</Badge>
                        )}
                        <span className="font-medium tabular-nums w-16 text-right shrink-0">{e.hours}h</span>
                      </li>
                    ))}
                  </ul>

                  {(rejecting === sheet.id || rejecting === 'bulk') && (
                    <div className="rounded-md border border-border/40 bg-card/40 p-3 mt-3 space-y-2">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t('timeApprovals.rejectPlaceholder')}
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setRejecting(null); setReason('') }}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (rejecting === 'bulk') {
                              await rejectSelected()
                              return
                            }
                            const parsed = parseSheetId(sheet.id)
                            if (!parsed || !reason.trim()) return
                            await rejectMutation.mutateAsync({ ...parsed, rejectReason: reason.trim() })
                            setRejecting(null)
                            setReason('')
                          }}
                          disabled={rejectMutation.isPending || reason.trim().length === 0}
                        >
                          {rejectMutation.isPending ? t('timeApprovals.sending') : t('timeApprovals.sendRejection')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
