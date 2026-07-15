import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Badge, cn, toast } from '@rundesk/ui'
import { Play, Pause, Clock, DollarSign, Download, Pencil, Trash2, Check, X, Send, CalendarRange, ClipboardCheck } from 'lucide-react'
import { format, startOfWeek, addDays } from 'date-fns'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'

type TimeEntry = {
  id: string
  taskId: string
  taskTitle?: string
  userId: string
  userName?: string
  description?: string | null
  durationSeconds: number
  billable: boolean
  loggedAt: string
}

type ActiveTimer = {
  id: string
  taskId: string
  description?: string | null
  startedAt: string
}

type TimeReportRow = {
  userId: string
  displayName: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  totalHours: number
  billableHours: number
}

type MonthlyRow = {
  userId: string
  displayName: string
  month: string // 'YYYY-MM'
  totalSeconds: number
  billableSeconds: number
  totalHours: number
  billableHours: number
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function safeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function formatMonth(month: string): string {
  // month is 'YYYY-MM'
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return format(new Date(Date.UTC(y, m - 1, 1)), 'MMM yyyy')
}

export function TimePage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/time' })
  const qc = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [tab, setTab] = useState<'timer' | 'timesheet' | 'monthly' | 'reports'>('timesheet')
  const [elapsedSec, setElapsedSec] = useState(0)

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekStartIso = useMemo(() => format(weekStart, 'yyyy-MM-dd'), [weekStart])

  const entriesQuery = useQuery({
    queryKey: ['time-entries', workspaceId],
    queryFn: async () => {
      try {
        return await api<TimeEntry[]>(`/workspaces/${workspaceId}/time-entries`)
      } catch {
        return [] as TimeEntry[]
      }
    },
  })

  const entries = entriesQuery.data ?? []
  const activeTimerQuery = useQuery({
    queryKey: ['active-timer'],
    queryFn: async () => {
      try {
        return await api<ActiveTimer | null>('/time-entries/active')
      } catch {
        return null
      }
    },
    refetchInterval: 5000,
  })
  const reportQuery = useQuery({
    queryKey: ['time-report', workspaceId],
    queryFn: async () => {
      try {
        return await api<TimeReportRow[]>(`/workspaces/${workspaceId}/reports/time?days=30`)
      } catch {
        return [] as TimeReportRow[]
      }
    },
    enabled: tab === 'reports',
  })
  const monthlyQuery = useQuery({
    queryKey: ['time-monthly', workspaceId],
    queryFn: async () => {
      try {
        return await api<MonthlyRow[]>(`/workspaces/${workspaceId}/time-monthly?months=6`)
      } catch {
        return [] as MonthlyRow[]
      }
    },
    enabled: tab === 'monthly',
  })
  const approvalStatusQuery = useQuery({
    queryKey: ['time-approvals', workspaceId, 'self'],
    queryFn: async () => {
      try {
        return await api<{
          canModerate: boolean
          items: Array<{ id: string; userId: string; weekStart: string; status: string }>
        }>(`/workspaces/${workspaceId}/time-approvals`)
      } catch {
        return { canModerate: false, items: [] }
      }
    },
  })

  const submitTimesheet = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/time-approvals/submit`, {
        method: 'POST',
        body: { weekStart: weekStartIso },
      }),
    onSuccess: async () => {
      toast(t('time.submitToast'), { description: t('time.submitToastDesc') })
      await qc.invalidateQueries({ queryKey: ['time-approvals', workspaceId] })
    },
    onError: (err) =>
      toast(t('time.submitError'), {
        description: err instanceof ApiError ? err.message : t('time.tryAgain'),
      }),
  })

  // Status of THIS week's submission for the current user (drives the submit button).
  const canModerate = approvalStatusQuery.data?.canModerate ?? false
  const myWeekStatus = (approvalStatusQuery.data?.items ?? []).find(
    (s) => s.weekStart === weekStartIso && s.userId === currentUserId,
  )?.status

  const activeTimer = activeTimerQuery.data ?? null
  useEffect(() => {
    if (!activeTimer?.startedAt) {
      setElapsedSec(0)
      return
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [activeTimer?.id, activeTimer?.startedAt])

  const startTimer = useMutation({
    mutationFn: (taskId: string) =>
      api(`/tasks/${taskId}/time-entries/start`, { method: 'POST', body: { description: 'Workspace timer' } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['active-timer'] }),
        qc.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
      ])
    },
  })
  const stopTimer = useMutation({
    mutationFn: (entryId: string) => api(`/tasks/${activeTimer?.taskId}/time-entries/stop/${entryId}`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['active-timer'] }),
        qc.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['time-report', workspaceId] }),
      ])
    },
  })

  const totalBySeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0)
  const billableSeconds = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.durationSeconds, 0)

  const byDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) {
      const key = format(new Date(e.loggedAt), 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + e.durationSeconds)
    }
    return map
  }, [entries])
  const quickStartTasks = useMemo(() => {
    const byTask = new Map<string, TimeEntry>()
    for (const entry of entries) {
      if (!entry.taskId || byTask.has(entry.taskId)) continue
      byTask.set(entry.taskId, entry)
    }
    return [...byTask.values()].slice(0, 6)
  }, [entries])
  const exportCsv = () => {
    const header = ['Task', 'User', 'Description', 'DurationSeconds', 'Billable', 'LoggedAt']
    const rows = entries.map((entry) => [
      safeCsv(entry.taskTitle ?? 'Task'),
      safeCsv(entry.userName ?? entry.userId),
      safeCsv(entry.description ?? ''),
      String(entry.durationSeconds),
      entry.billable ? 'true' : 'false',
      safeCsv(entry.loggedAt),
    ])
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `time-entries-${workspaceId}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">{t('common.workspace')}</div>
            <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
              {t('time.title')}
              <Badge variant="secondary">{t('time.live')}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t('time.subtitle')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> {t('time.exportCsv')}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-1 -mb-[1px]">
          {(['timesheet', 'timer', 'monthly', 'reports'] as const).map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={cn(
                'relative px-3 py-2 text-sm font-medium',
                tab === tabId ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`time.tab.${tabId}`)}
              {tab === tabId && <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-brand-700 rounded-t" />}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard icon={Clock} label={t('time.stat.totalThisWeek')} value={formatHours(totalBySeconds)} />
          <StatCard icon={DollarSign} label={t('time.billable')} value={formatHours(billableSeconds)} />
          <StatCard icon={Clock} label={t('time.entries')} value={`${entries.length}`} />
        </div>

        {tab === 'timer' && (
          <Card className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-brand-700 text-white mx-auto flex items-center justify-center mb-3">
              {activeTimer ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-1" />}
            </div>
            <div className="font-display text-4xl font-semibold text-foreground tabular-nums">{formatTimer(elapsedSec)}</div>
            {activeTimer ? (
              <p className="text-sm text-muted-foreground mt-2">{t('time.activeTask', { task: entries.find((e) => e.taskId === activeTimer.taskId)?.taskTitle ?? t('time.taskFallback') })}</p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">{t('time.startFromRecent')}</p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {activeTimer ? (
                <Button
                  onClick={() => stopTimer.mutate(activeTimer.id)}
                  disabled={stopTimer.isPending}
                  variant="outline"
                >
                  <Pause className="h-4 w-4 mr-1.5" />
                  {stopTimer.isPending ? t('time.stopping') : t('time.stopTimer')}
                </Button>
              ) : (
                quickStartTasks.map((task) => (
                  <Button
                    key={task.taskId}
                    variant="outline"
                    size="sm"
                    onClick={() => startTimer.mutate(task.taskId)}
                    disabled={startTimer.isPending}
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    {task.taskTitle ?? t('time.taskFallback')}
                  </Button>
                ))
              )}
            </div>
          </Card>
        )}

        {tab === 'timesheet' && (
          <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('time.weekOf')}</span>
              <span className="font-medium text-foreground">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}</span>
              {myWeekStatus === 'submitted' && <Badge variant="warning" className="text-[10px] uppercase">{t('time.status.submitted')}</Badge>}
              {myWeekStatus === 'approved' && <Badge variant="success" className="text-[10px] uppercase">{t('time.status.approved')}</Badge>}
              {myWeekStatus === 'rejected' && <Badge variant="destructive" className="text-[10px] uppercase">{t('time.status.rejectedResubmit')}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {canModerate && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/$workspaceId/time/approvals" params={{ workspaceId }} search={{ tab: 'pending', historyFilter: 'all' }}>
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" /> {t('time.approvals')}
                  </Link>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => submitTimesheet.mutate()}
                disabled={submitTimesheet.isPending || entries.length === 0 || myWeekStatus === 'submitted' || myWeekStatus === 'approved'}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {myWeekStatus === 'submitted'
                  ? t('time.awaitingApproval')
                  : myWeekStatus === 'approved'
                  ? t('time.status.approved')
                  : submitTimesheet.isPending
                  ? t('time.submitting')
                  : myWeekStatus === 'rejected'
                  ? t('time.resubmitForApproval')
                  : t('time.submitForApproval')}
              </Button>
            </div>
          </div>
          <Card className="p-4">
            <div className="grid grid-cols-8 gap-2 border-b border-border pb-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1">{t('time.col.task')}</div>
              {days.map((d) => (
                <div key={d.toISOString()} className="text-center">
                  {format(d, 'EEE')}
                  <div className="text-[10px] font-normal normal-case">{format(d, 'MMM d')}</div>
                </div>
              ))}
            </div>
            {entries.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('time.noTimeThisWeek')}
              </div>
            ) : (
              <div className="space-y-1">
                {entries.slice(0, 10).map((e) => (
                  <div key={e.id} className="grid grid-cols-8 gap-2 items-center py-1.5 text-sm border-b border-border/40">
                    <div className="col-span-1 truncate">{e.taskTitle ?? t('time.taskFallback')}</div>
                    {days.map((d) => {
                      const key = format(d, 'yyyy-MM-dd')
                      const entryKey = format(new Date(e.loggedAt), 'yyyy-MM-dd')
                      const show = key === entryKey
                      return (
                        <div key={key} className="text-center tabular-nums text-muted-foreground">
                          {show ? formatHours(e.durationSeconds) : '—'}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-border grid grid-cols-8 gap-2 text-sm font-semibold text-foreground">
              <div className="col-span-1">{t('time.total')}</div>
              {days.map((d) => {
                const key = format(d, 'yyyy-MM-dd')
                const sec = byDay.get(key) ?? 0
                return (
                  <div key={key} className="text-center tabular-nums">
                    {sec > 0 ? formatHours(sec) : '—'}
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{t('time.entries')}</h3>
              <span className="text-xs text-muted-foreground">{t('time.entriesTotal', { count: entries.length })}</span>
            </div>
            {entries.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('time.noEntries')}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    workspaceId={workspaceId}
                    editable={e.userId === currentUserId}
                  />
                ))}
              </div>
            )}
          </Card>
          </>
        )}

        {tab === 'monthly' && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarRange className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">{t('time.monthlyTitle')}</h3>
              <span className="text-xs text-muted-foreground">{t('time.last6Months')}{canModerate ? ` · ${t('time.allMembers')}` : ''}</span>
            </div>
            <div className={cn('grid grid-cols-4 gap-2 border-b border-border pb-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider', !canModerate && 'grid-cols-3')}>
              <div>{t('time.col.month')}</div>
              {canModerate && <div>{t('time.member')}</div>}
              <div className="text-center">{t('time.col.totalHours')}</div>
              <div className="text-center">{t('time.col.billableHours')}</div>
            </div>
            {monthlyQuery.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
            ) : (monthlyQuery.data ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('time.noMonthly')}</div>
            ) : (
              <div className="space-y-1">
                {(monthlyQuery.data ?? []).map((row) => (
                  <div
                    key={`${row.month}:${row.userId}`}
                    className={cn('grid grid-cols-4 gap-2 py-1.5 text-sm border-b border-border/40', !canModerate && 'grid-cols-3')}
                  >
                    <div className="tabular-nums">{formatMonth(row.month)}</div>
                    {canModerate && <div className="truncate">{row.displayName || t('time.member')}</div>}
                    <div className="text-center tabular-nums">{row.totalHours.toFixed(1)}h</div>
                    <div className="text-center tabular-nums text-success">{row.billableHours.toFixed(1)}h</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === 'reports' && (
          <Card className="p-4">
            <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div>{t('time.member')}</div>
              <div className="text-center">{t('time.entries')}</div>
              <div className="text-center">{t('time.col.totalHours')}</div>
              <div className="text-center">{t('time.col.billableHours')}</div>
            </div>
            {(reportQuery.data ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('time.noReport')}</div>
            ) : (
              <div className="space-y-1">
                {(reportQuery.data ?? []).map((row) => (
                  <div key={row.userId} className="grid grid-cols-4 gap-2 py-1.5 text-sm border-b border-border/40">
                    <div className="truncate">{row.displayName || t('time.member')}</div>
                    <div className="text-center tabular-nums">{row.entryCount}</div>
                    <div className="text-center tabular-nums">{row.totalHours.toFixed(1)}h</div>
                    <div className="text-center tabular-nums">{row.billableHours.toFixed(1)}h</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  workspaceId,
  editable,
}: {
  entry: TimeEntry
  workspaceId: string
  editable: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [durationMin, setDurationMin] = useState(String(Math.round(entry.durationSeconds / 60)))
  const [description, setDescription] = useState(entry.description ?? '')
  const [billable, setBillable] = useState(entry.billable)

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
      qc.invalidateQueries({ queryKey: ['time-report', workspaceId] }),
    ])

  const save = useMutation({
    mutationFn: () => {
      const minutes = Number(durationMin)
      if (!Number.isFinite(minutes) || minutes < 0) throw new Error(t('time.invalidDuration'))
      return api(`/time-entries/${entry.id}`, {
        method: 'PATCH',
        body: {
          durationSec: Math.round(minutes * 60),
          description: description.trim() || null,
          isBillable: billable,
        },
      })
    },
    onSuccess: async () => {
      setEditing(false)
      await invalidate()
    },
    onError: (err) => window.alert(err instanceof Error ? err.message : t('time.couldNotSave')),
  })

  const del = useMutation({
    mutationFn: () => api(`/time-entries/${entry.id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(),
    onError: (err) => window.alert(err instanceof Error ? err.message : t('time.couldNotDelete')),
  })

  const startEdit = () => {
    setDurationMin(String(Math.round(entry.durationSeconds / 60)))
    setDescription(entry.description ?? '')
    setBillable(entry.billable)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-foreground">{entry.taskTitle ?? t('time.taskFallback')}</span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            min={0}
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            className="w-16 h-8 rounded-md border border-border/80 bg-background px-2 tabular-nums"
          />
          {t('time.minutesShort')}
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('time.descriptionPlaceholder')}
          className="h-8 flex-1 min-w-[8rem] rounded-md border border-border/80 bg-background px-2"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          {t('time.billable')}
        </label>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-2 text-sm group">
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">{entry.taskTitle ?? t('time.taskFallback')}</p>
        <p className="truncate text-xs text-muted-foreground">
          {format(new Date(entry.loggedAt), 'MMM d, yyyy')}
          {!editable && entry.userName ? ` · ${entry.userName}` : ''}
          {entry.description ? ` · ${entry.description}` : ''}
        </p>
      </div>
      {entry.billable && (
        <Badge variant="secondary" className="shrink-0">
          {t('time.billable')}
        </Badge>
      )}
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
        {formatHours(entry.durationSeconds)}
      </span>
      {editable && (
        <>
          <button
            onClick={startEdit}
            aria-label={t('time.editEntry')}
            className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground hover:bg-accent/10"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (window.confirm(t('time.confirmDelete'))) del.mutate()
            }}
            disabled={del.isPending}
            aria-label={t('time.deleteEntry')}
            className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

function formatTimer(seconds: number): string {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-display text-xl font-semibold text-foreground tabular-nums">{value}</div>
      </div>
    </Card>
  )
}
