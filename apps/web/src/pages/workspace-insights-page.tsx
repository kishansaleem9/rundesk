import { useMemo, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Badge,
  Button,
  Progress,
  PersonAvatar,
  cn,
  toast,
} from '@rundesk/ui'
import {
  Sparkles,
  Sun,
  AlertTriangle,
  Heart,
  Award,
  Target,
  ChevronRight,
  Lightbulb,
  Download,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { api, downloadFilePost } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { useWorkspaceStore } from '../store/workspace'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from '../components/loading-skeletons'

type WorkloadMove = {
  fromUserId: string
  fromName: string
  toUserId: string
  toName: string
  count: number
  taskIds: string[]
  rationale: string
  source: 'ai' | 'heuristic'
}
type WorkloadBalance = {
  source: 'ai' | 'heuristic'
  average: number
  loads: Array<{ userId: string; name: string; open: number }>
  suggestions: WorkloadMove[]
}
type ContributionMember = {
  userId: string
  name: string
  email: string | null
  tasksCompleted: number
  tasksAssigned: number
  onTimeRate: number
  collaboration: number
  blockersResolved: number
  score: number
  narrative: string
}
type ContributionReport = {
  period: { type: string; from: string; to: string; label: string; sprintId?: string }
  source: 'ai' | 'heuristic'
  members: ContributionMember[]
}
type ContributionPeriod = 'this-month' | 'last-month' | 'sprint'

/** Stable key for a workload move (used to dismiss/track a specific suggestion). */
function moveKey(m: { fromUserId: string; toUserId: string }): string {
  return `${m.fromUserId}->${m.toUserId}`
}

type HealthRow = {
  project: string
  score: number
  delta: string
  dim: { onTime: number; activity: number; blockers: string }
}

type AiInsights = {
  summary: string
  health: { score: number; label: string; reasoning: string }
  suggestions: Array<{ title: string; detail: string; cta?: string; target?: string }>
}

export function InsightsPage() {
  const { t, tCount } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/insights' })
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  // Managers/admins can execute workload moves and export the contribution PDF.
  const canManage = useWorkspaceStore((s) => {
    const ws = s.workspaces.find((w) => w.id === workspaceId) ?? s.active
    return ['workspace_admin', 'manager', 'super_admin'].includes(ws?.role ?? '')
  })
  const [contribPeriod, setContribPeriod] = useState<ContributionPeriod>('this-month')
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? t('insights.greetingMorning') : hour < 18 ? t('insights.greetingAfternoon') : t('insights.greetingEvening')

  // Dismissed workload suggestions, keyed by the overloaded member's name and
  // persisted per-workspace (a per-device preference) so they survive reload.
  const dismissKey = `rundesk.insights.dismissedWorkload.${workspaceId}`
  const [dismissedWorkload, setDismissedWorkload] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(dismissKey)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })
  const dismissWorkload = (key: string) =>
    setDismissedWorkload((prev) => {
      const next = new Set(prev).add(key)
      try {
        localStorage.setItem(dismissKey, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })

  // All four "go deeper" controls land on the Reports page (overview, sprints,
  // workload, productivity all live there).
  const goToReports = () => navigate({ to: '/app/$workspaceId/reports', params: { workspaceId } })

  const overviewQ = useQuery({
    queryKey: ['reports-overview', workspaceId],
    queryFn: () =>
      api<{ total: number; completed: number; overdue: number; dueToday: number; completionRate: number }>(
        `/workspaces/${workspaceId}/reports/overview`,
      ),
  })

  const sprintsQ = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () =>
      api<
        Array<{
          id: string
          name: string
          status: string
          totalPoints: number
          completedPoints: number
        }>
      >(`/workspaces/${workspaceId}/sprints`),
  })

  const productivityQ = useQuery({
    queryKey: ['reports-productivity', workspaceId],
    queryFn: () =>
      api<
        Array<{
          displayName: string | null
          email: string
          tasksCompleted: number
          totalAssigned: number
        }>
      >(`/workspaces/${workspaceId}/reports/productivity?days=30`),
  })

  const workloadQ = useQuery({
    queryKey: ['workload-report', workspaceId, 14],
    queryFn: () =>
      api<Array<{ name: string; capacity: number; dailyLoads: number[] }>>(
        `/workspaces/${workspaceId}/reports/workload?days=14`,
      ),
  })

  const tasksQ = useQuery({
    queryKey: ['insights-tasks', workspaceId],
    queryFn: () =>
      api<
        Array<{
          projectName: string
          status: string
          statusCategory: string
          dueDate?: string | null
        }>
      >(`/tasks/workspace/${workspaceId}?limit=500`),
  })

  // §7.14 — real per-member contribution factors + AI narrative for the period.
  const contribQ = useQuery({
    queryKey: ['contribution', workspaceId, contribPeriod],
    queryFn: () =>
      api<ContributionReport>(`/workspaces/${workspaceId}/reports/contribution?period=${contribPeriod}`),
  })

  // §7.12 — AI (with deterministic fallback) workload redistribution from real load.
  const wbQ = useQuery({
    queryKey: ['workload-balance', workspaceId],
    retry: false,
    staleTime: 60_000,
    queryFn: () => api<WorkloadBalance>('/ai/workload-balance', { method: 'POST', body: { workspaceId } }),
  })

  const executeMove = useMutation({
    mutationFn: (move: WorkloadMove) =>
      api<{ reassigned: number; skipped: number }>('/ai/workload-balance/execute', {
        method: 'POST',
        body: {
          workspaceId,
          moves: [{ fromUserId: move.fromUserId, toUserId: move.toUserId, taskIds: move.taskIds }],
        },
      }),
    onSuccess: (res, move) => {
      toast.success(t('insights.workloadReassigned', { count: res.reassigned, from: move.fromName, to: move.toName }))
      dismissWorkload(moveKey(move))
      qc.invalidateQueries({ queryKey: ['workload-balance', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workload-report', workspaceId, 14] })
    },
    onError: () => toast.error(t('insights.workloadReassignFailed')),
  })

  const downloadContributionPdf = async () => {
    try {
      await downloadFilePost(
        `/workspaces/${workspaceId}/reports/contribution.pdf`,
        { period: contribPeriod },
        'rundesk-contribution.pdf',
      )
    } catch {
      toast.error(t('insights.contributionPdfError'))
    }
  }

  const activeSprint = sprintsQ.data?.find((s) => s.status === 'active')
  const overview = overviewQ.data

  // Real metrics rolled into a compact prompt for the AI insights endpoint.
  const aiContext = useMemo(() => {
    const o = overviewQ.data
    const wl = workloadQ.data ?? []
    const over = wl.filter((p) => p.dailyLoads.some((l) => l > p.capacity)).map((p) => p.name)
    const top = (productivityQ.data ?? [])
      .slice(0, 5)
      .map((r) => `${r.displayName ?? r.email}: ${r.tasksCompleted}/${r.totalAssigned} done`)
    return [
      o ? `Tasks: ${o.total} total, ${o.completed} completed (${o.completionRate}%), ${o.overdue} overdue, ${o.dueToday} due today.` : '',
      activeSprint
        ? `Active sprint "${activeSprint.name}": ${activeSprint.completedPoints}/${activeSprint.totalPoints} points complete.`
        : 'No active sprint.',
      over.length ? `Over capacity this week: ${over.join(', ')}.` : 'Team workload looks balanced.',
      top.length ? `Top contributors (30d): ${top.join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }, [overviewQ.data, activeSprint, workloadQ.data, productivityQ.data])

  const aiQ = useQuery({
    queryKey: ['ai-insights', workspaceId, aiContext],
    enabled: Boolean(overviewQ.data && tasksQ.data) && aiContext.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => api<AiInsights>('/ai/insights', { method: 'POST', body: { context: aiContext } }),
  })
  const ai = aiQ.data

  const briefing = useMemo(() => {
    const highlights: Array<{ kind: 'win' | 'risk' | 'flag'; text: string }> = []
    if (overview?.completionRate && overview.completionRate >= 50) {
      highlights.push({
        kind: 'win',
        text: t('insights.highlightCompletion', { rate: overview.completionRate }),
      })
    }
    if (overview?.overdue && overview.overdue > 0) {
      highlights.push({
        kind: 'risk',
        text: tCount('insights.highlightOverdue', overview.overdue),
      })
    }
    const overloaded = (workloadQ.data ?? []).filter((p) =>
      p.dailyLoads.some((load) => load > p.capacity),
    )
    if (overloaded[0]) {
      highlights.push({
        kind: 'flag',
        text: t('insights.highlightOverCapacity', { name: overloaded[0].name }),
      })
    }

    let summary = tCount('insights.summaryOpenTasks', overview?.total ?? 0)
    if (activeSprint) {
      summary = t('insights.summarySprint', {
        name: activeSprint.name,
        completed: activeSprint.completedPoints,
        total: activeSprint.totalPoints,
      })
    }
    if (overview?.dueToday) {
      summary += ` ${t('insights.summaryDueToday', { count: overview.dueToday })}`
    }

    return {
      greeting: t('insights.greeting', {
        greeting,
        name: user?.displayName?.split(' ')[0] ?? t('insights.thereFallback'),
      }),
      date: new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      summary,
      highlights,
    }
  }, [greeting, user, overview, activeSprint, workloadQ.data, t, tCount])

  const health: HealthRow[] = useMemo(() => {
    const byProject = new Map<string, { total: number; done: number; overdue: number }>()
    for (const task of tasksQ.data ?? []) {
      const cur = byProject.get(task.projectName) ?? { total: 0, done: 0, overdue: 0 }
      cur.total += 1
      if (task.statusCategory === 'closed' || task.status === 'done') cur.done += 1
      if (task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done') cur.overdue += 1
      byProject.set(task.projectName, cur)
    }
    return [...byProject.entries()]
      .map(([project, stats]) => {
        const rate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
        const score = Math.max(0, Math.min(100, rate - stats.overdue * 5))
        return {
          project,
          score,
          delta: stats.overdue > 0 ? `-${stats.overdue}` : '+0',
          dim: {
            onTime: rate,
            activity: stats.total,
            blockers: stats.overdue > 2 ? 'high' : stats.overdue > 0 ? 'medium' : 'low',
          },
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }, [tasksQ.data])

  // §7.14 — real contribution factors + AI narrative come from the server.
  const contrib = contribQ.data?.members ?? []

  // Suggestions: prefer the AI ones; fall back to real-derived heuristics when
  // AI is unavailable. Both are clickable and navigate to Reports.
  const fallbackSuggestions = useMemo(() => {
    const items: Array<{ text: string; cta: string }> = []
    if (overview?.overdue) {
      items.push({ text: tCount('insights.fallbackReviewOverdue', overview.overdue), cta: t('insights.ctaViewOverdue') })
    }
    if (activeSprint && activeSprint.completedPoints < activeSprint.totalPoints * 0.5) {
      items.push({ text: t('insights.fallbackSprintUnder', { name: activeSprint.name }), cta: t('insights.ctaOpenSprint') })
    }
    const underloaded = (workloadQ.data ?? []).find((p) => p.dailyLoads.every((l) => l < p.capacity * 0.6))
    const overloaded = (workloadQ.data ?? []).find((p) => p.dailyLoads.some((l) => l > p.capacity))
    if (underloaded && overloaded) {
      items.push({ text: t('insights.fallbackMoveWork', { from: overloaded.name, to: underloaded.name }), cta: t('insights.ctaWorkload') })
    }
    return items.slice(0, 3)
  }, [overview, activeSprint, workloadQ.data, t, tCount])

  const shownSuggestions = ai?.suggestions?.length
    ? ai.suggestions.map((s) => ({ text: s.detail || s.title, cta: s.cta ?? t('insights.ctaOpen') }))
    : fallbackSuggestions

  // §7.12 — AI/heuristic redistribution suggestions from the server, minus any
  // the user has locally dismissed.
  const workloadSuggestions = wbQ.data?.suggestions ?? []
  const visibleWorkload = workloadSuggestions.filter((s) => !dismissedWorkload.has(moveKey(s)))

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          {t('insights.eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow animate-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          {t('insights.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          {t('insights.subtitle')}
          {ai ? t('insights.subtitleAiSuffix') : '.'}
        </p>
      </header>

      {/* Daily briefing card */}
      <Card variant="glass" className="overflow-hidden p-0 relative">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-brand-gradient opacity-20 blur-3xl pointer-events-none" />
        <div className="relative p-6 md:p-8 grid md:grid-cols-[1fr_280px] gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Sun className="h-3.5 w-3.5 text-amber" />
              {briefing.date}
              <Badge variant="gradient" className="text-[9px] uppercase ml-1">
                {t('insights.dailyBriefing')}
              </Badge>
            </div>
            <h2 className="font-display text-2xl font-semibold mb-2">{briefing.greeting}</h2>
            <p className="text-sm leading-relaxed text-foreground/90">{ai?.summary ?? briefing.summary}</p>
            {ai?.health && (
              <div className="mt-2 text-xs text-muted-foreground">
                {t('insights.workspaceHealth')}{' '}
                <span className="font-medium text-foreground capitalize">{ai.health.label.replace('_', ' ')}</span>{' '}
                ({ai.health.score}/100) — {ai.health.reasoning}
              </div>
            )}
            <ul className="mt-4 space-y-1.5">
              {briefing.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 rounded-full shrink-0',
                      h.kind === 'win' && 'bg-success',
                      h.kind === 'risk' && 'bg-warning',
                      h.kind === 'flag' && 'bg-destructive',
                    )}
                  />
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              {ai ? <Sparkles className="h-3 w-3" /> : null}
              {ai ? t('insights.aiSuggestions') : t('insights.suggestions')}
            </div>
            {shownSuggestions.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                {aiQ.isError ? t('insights.aiUnavailable') : t('insights.nothingNeedsAttention')}
              </div>
            ) : (
              shownSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={goToReports}
                  className="group w-full text-left rounded-lg border border-border/40 bg-card/40 p-3 hover:border-accent/40 hover:bg-card/60 transition-all"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient-soft text-white shrink-0">
                      <Lightbulb className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 text-xs leading-relaxed">{s.text}</div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <span className="block mt-2 text-[10px] text-accent font-medium">{s.cta} →</span>
                </button>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Project health */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink" />
              {t('insights.projectHealth')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('insights.projectHealthDesc')}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={goToReports}>
            {t('insights.seeTrendInReports')}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {health.length === 0 ? (
            <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
              {t('insights.noProjectData')}
            </Card>
          ) : (
            health.map((p) => <HealthCard key={p.project} project={p} />)
          )}
        </div>
      </section>

      {/* Contribution analytics (§7.14) */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-amber" />
              {t('insights.contributionAnalytics')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('insights.contributionDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border/60 p-0.5 text-xs">
              {(['this-month', 'last-month', 'sprint'] as ContributionPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setContribPeriod(p)}
                  className={cn(
                    'px-2.5 py-1 rounded-md transition-colors',
                    contribPeriod === p
                      ? 'bg-brand-gradient text-white'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p === 'this-month'
                    ? t('insights.periodThisMonth')
                    : p === 'last-month'
                      ? t('insights.periodLastMonth')
                      : t('insights.periodSprint')}
                </button>
              ))}
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={downloadContributionPdf}>
                <Download className="h-3.5 w-3.5" /> {t('insights.downloadPdf')}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={goToReports}>
              {t('insights.openInReports')}
            </Button>
          </div>
        </div>
        <Card variant="glass" className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {contribQ.data?.period.label ?? <InlineSkeleton width="7rem" />}
            </div>
            {contribQ.data?.source === 'ai' && (
              <Badge variant="gradient" className="text-[9px] uppercase">
                <Sparkles className="h-2.5 w-2.5 mr-1" />
                {t('insights.aiNarrative')}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-[1fr_52px_100px_52px_60px_48px] gap-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40 px-4 py-2">
            <div>{t('insights.colPerson')}</div>
            <div className="text-right">{t('insights.colTasks')}</div>
            <div className="text-right">{t('insights.colOnTime')}</div>
            <div className="text-right">{t('insights.colCollab')}</div>
            <div className="text-right">{t('insights.colBlockers')}</div>
            <div className="text-right">{t('insights.colScore')}</div>
          </div>
          <ul className="divide-y divide-border/30">
            {contribQ.isLoading ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                <InlineSkeleton />
              </li>
            ) : contrib.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('insights.noTeamActivity')}
              </li>
            ) : (
              contrib.map((c, i) => (
                <li
                  key={c.userId}
                  className="grid grid-cols-[1fr_52px_100px_52px_60px_48px] gap-2 items-center px-4 py-3 hover:bg-card/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums shrink-0">
                      {i + 1}
                    </div>
                    <PersonAvatar name={c.name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">{c.narrative}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{c.tasksCompleted}</div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Progress value={c.onTimeRate} className="w-10 h-1" />
                      <span className="text-xs tabular-nums w-7 text-right">{c.onTimeRate}%</span>
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{c.collaboration}</div>
                  <div className="text-right">
                    <Badge variant={c.blockersResolved > 0 ? 'success' : 'soft'} className="text-[10px] tabular-nums">
                      {c.blockersResolved}
                    </Badge>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">{c.score}</div>
                </li>
              ))
            )}
          </ul>
        </Card>
      </section>

      {/* Workload balancing (§7.12) */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-mint" />
              {t('insights.workloadBalancing')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('insights.workloadDesc')}</p>
          </div>
          {wbQ.data && visibleWorkload.length > 0 && (
            <Badge variant={wbQ.data.source === 'ai' ? 'gradient' : 'soft'} className="text-[9px] uppercase shrink-0">
              {wbQ.data.source === 'ai' ? (
                <>
                  <Sparkles className="h-2.5 w-2.5 mr-1" />
                  {t('insights.sourceAi')}
                </>
              ) : (
                t('insights.sourceHeuristic')
              )}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {wbQ.isLoading ? (
            <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
              <InlineSkeleton />
            </Card>
          ) : visibleWorkload.length === 0 ? (
            <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
              {wbQ.isError ? t('insights.workloadUnavailable') : t('insights.workloadBalanced')}
            </Card>
          ) : (
            visibleWorkload.map((s) => {
              const isRunning =
                executeMove.isPending && executeMove.variables && moveKey(executeMove.variables) === moveKey(s)
              return (
                <Card key={moveKey(s)} className="p-3 bg-card/30">
                  <div className="flex items-center gap-2 mb-2">
                    <PersonAvatar name={s.fromName} size="sm" />
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <PersonAvatar name={s.toName} size="sm" />
                    <Badge variant="soft" className="text-[10px] tabular-nums ml-auto">
                      {tCount('insights.moveCount', s.count)}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed mb-2">{s.rationale}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] flex-1"
                      onClick={() => dismissWorkload(moveKey(s))}
                      disabled={isRunning}
                    >
                      <X className="h-3 w-3" /> {t('insights.dismiss')}
                    </Button>
                    {canManage ? (
                      <Button
                        variant="gradient"
                        size="sm"
                        className="h-6 text-[10px] flex-1"
                        onClick={() => executeMove.mutate(s)}
                        disabled={executeMove.isPending}
                      >
                        {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {t('insights.accept')}
                      </Button>
                    ) : (
                      <Button
                        variant="gradient"
                        size="sm"
                        className="h-6 text-[10px] flex-1"
                        onClick={goToReports}
                      >
                        {t('insights.openWorkload')}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}

function HealthCard({ project }: { project: HealthRow }) {
  const { t } = useTranslation()
  const positive = project.delta.startsWith('+')
  // Current health band (matches the §7.13 backend thresholds: green ≥ 75,
  // yellow ≥ 50, else red) shown as a badge alongside the score.
  const band = project.score >= 75 ? 'green' : project.score >= 50 ? 'yellow' : 'red'
  const bandLabel =
    band === 'green' ? t('insights.bandGreen') : band === 'yellow' ? t('insights.bandYellow') : t('insights.bandRed')
  const bandVariant: 'success' | 'warning' | 'destructive' =
    band === 'green' ? 'success' : band === 'yellow' ? 'warning' : 'destructive'
  const blockerLabel =
    project.dim.blockers === 'high'
      ? t('insights.levelHigh')
      : project.dim.blockers === 'medium'
        ? t('insights.levelMedium')
        : t('insights.levelLow')
  const ringColor =
    project.score >= 85 ? 'hsl(var(--success))'
    : project.score >= 70 ? 'hsl(var(--accent-violet))'
    : project.score >= 55 ? 'hsl(var(--warning))'
    : 'hsl(var(--destructive))'
  const C = 2 * Math.PI * 28
  const dash = (project.score / 100) * C

  return (
    <Card variant="glass" className="p-4">
      <div className="flex items-center gap-3 mb-2">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90 shrink-0">
          <circle cx="32" cy="32" r="28" stroke="hsl(var(--muted))" strokeWidth="6" fill="none" />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke={ringColor}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: 'stroke-dasharray 0.6s' }}
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('insights.score')}</div>
          <div className="font-display text-2xl font-semibold tabular-nums">{project.score}</div>
          <span
            className={cn(
              'text-[11px] font-medium tabular-nums',
              positive ? 'text-success' : 'text-destructive',
            )}
          >
            {project.delta}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{project.project}</div>
        <Badge variant={bandVariant} className="text-[9px] uppercase shrink-0">
          {bandLabel}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-2 text-[10px] text-muted-foreground">
        <span>{t('insights.onTime', { value: project.dim.onTime })}</span>
        <span>{t('insights.activity', { value: project.dim.activity })}</span>
        <span className="capitalize col-span-2">{t('insights.blockers', { value: blockerLabel })}</span>
      </div>
    </Card>
  )
}
