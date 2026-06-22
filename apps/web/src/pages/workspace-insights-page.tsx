import { useMemo, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Card,
  Badge,
  Button,
  Progress,
  PersonAvatar,
  cn,
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
  Printer,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

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
  const { workspaceId } = useParams({ from: '/app/$workspaceId/insights' })
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

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
  const dismissWorkload = (name: string) =>
    setDismissedWorkload((prev) => {
      const next = new Set(prev).add(name)
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
        text: `${overview.completionRate}% of workspace tasks are complete.`,
      })
    }
    if (overview?.overdue && overview.overdue > 0) {
      highlights.push({
        kind: 'risk',
        text: `${overview.overdue} task${overview.overdue === 1 ? '' : 's'} overdue — review due dates.`,
      })
    }
    const overloaded = (workloadQ.data ?? []).filter((p) =>
      p.dailyLoads.some((load) => load > p.capacity),
    )
    if (overloaded[0]) {
      highlights.push({
        kind: 'flag',
        text: `${overloaded[0].name} is over capacity this week — consider rebalancing.`,
      })
    }

    let summary = `${overview?.total ?? 0} open tasks across the workspace.`
    if (activeSprint) {
      summary = `${activeSprint.name}: ${activeSprint.completedPoints} of ${activeSprint.totalPoints} story points complete.`
    }
    if (overview?.dueToday) {
      summary += ` ${overview.dueToday} due today.`
    }

    return {
      greeting: `${greeting}, ${user?.displayName?.split(' ')[0] ?? 'there'}.`,
      date: new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      summary,
      highlights,
    }
  }, [greeting, user, overview, activeSprint, workloadQ.data])

  const health: HealthRow[] = useMemo(() => {
    const byProject = new Map<string, { total: number; done: number; overdue: number }>()
    for (const t of tasksQ.data ?? []) {
      const cur = byProject.get(t.projectName) ?? { total: 0, done: 0, overdue: 0 }
      cur.total += 1
      if (t.statusCategory === 'closed' || t.status === 'done') cur.done += 1
      if (t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done') cur.overdue += 1
      byProject.set(t.projectName, cur)
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

  // Real contribution data (no fabricated complexity/collaboration metrics).
  const contrib = useMemo(
    () =>
      (productivityQ.data ?? [])
        .filter((r) => r.displayName || r.email)
        .map((r) => ({
          name: r.displayName ?? r.email,
          tasks: r.tasksCompleted,
          onTime: r.totalAssigned > 0 ? Math.round((r.tasksCompleted / r.totalAssigned) * 100) : 0,
          blockers: Math.max(0, r.totalAssigned - r.tasksCompleted),
        }))
        .sort((a, b) => b.tasks - a.tasks)
        .slice(0, 8),
    [productivityQ.data],
  )

  // Suggestions: prefer the AI ones; fall back to real-derived heuristics when
  // AI is unavailable. Both are clickable and navigate to Reports.
  const fallbackSuggestions = useMemo(() => {
    const items: Array<{ text: string; cta: string }> = []
    if (overview?.overdue) {
      items.push({ text: `Review ${overview.overdue} overdue tasks and reschedule or close them.`, cta: 'View overdue' })
    }
    if (activeSprint && activeSprint.completedPoints < activeSprint.totalPoints * 0.5) {
      items.push({ text: `${activeSprint.name} is under 50% complete — add tasks or adjust scope.`, cta: 'Open sprint' })
    }
    const underloaded = (workloadQ.data ?? []).find((p) => p.dailyLoads.every((l) => l < p.capacity * 0.6))
    const overloaded = (workloadQ.data ?? []).find((p) => p.dailyLoads.some((l) => l > p.capacity))
    if (underloaded && overloaded) {
      items.push({ text: `Move work from ${overloaded.name} to ${underloaded.name} to balance load.`, cta: 'Workload' })
    }
    return items.slice(0, 3)
  }, [overview, activeSprint, workloadQ.data])

  const shownSuggestions = ai?.suggestions?.length
    ? ai.suggestions.map((s) => ({ text: s.detail || s.title, cta: s.cta ?? 'Open' }))
    : fallbackSuggestions

  const workloadSuggestions = useMemo(() => {
    const people = workloadQ.data ?? []
    const overloaded = people.filter((p) => p.dailyLoads.some((l) => l > p.capacity))
    const underloaded = people.filter((p) => p.dailyLoads.every((l) => l < p.capacity * 0.7))
    const pairs: Array<{ from: string; fromLoad: number; to: string; toLoad: number; reasoning: string }> = []
    for (const from of overloaded.slice(0, 3)) {
      const to = underloaded[0]
      if (!to) break
      const fromLoad = Math.round(
        (from.dailyLoads.reduce((a, b) => a + b, 0) / from.dailyLoads.length / from.capacity) * 100,
      )
      const toLoad = Math.round(
        (to.dailyLoads.reduce((a, b) => a + b, 0) / to.dailyLoads.length / to.capacity) * 100,
      )
      pairs.push({
        from: from.name,
        fromLoad,
        to: to.name,
        toLoad,
        reasoning: `${from.name} is above daily capacity; ${to.name} has bandwidth this week.`,
      })
    }
    return pairs
  }, [workloadQ.data])

  const visibleWorkload = workloadSuggestions.filter((s) => !dismissedWorkload.has(s.from))

  return (
    <div className="p-6 space-y-7 max-w-7xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          Insights
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-glow animate-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          Insights
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          Your daily briefing, project health, and team contribution analytics
          {ai ? ' — summary and suggestions generated by Claude.' : '.'}
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
                Daily briefing
              </Badge>
            </div>
            <h2 className="font-display text-2xl font-semibold mb-2">{briefing.greeting}</h2>
            <p className="text-sm leading-relaxed text-foreground/90">{ai?.summary ?? briefing.summary}</p>
            {ai?.health && (
              <div className="mt-2 text-xs text-muted-foreground">
                Workspace health:{' '}
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
              {ai ? 'AI suggestions' : 'Suggestions'}
            </div>
            {shownSuggestions.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                {aiQ.isError ? 'AI suggestions unavailable.' : 'Nothing needs attention right now.'}
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
              Project health
            </h2>
            <p className="text-xs text-muted-foreground">
              0–100 score · on-time %, activity, blockers
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={goToReports}>
            See trend in Reports
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {health.length === 0 ? (
            <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
              No project data yet. Create tasks in your spaces to see health scores.
            </Card>
          ) : (
            health.map((p) => <HealthCard key={p.project} project={p} />)
          )}
        </div>
      </section>

      {/* Contribution analytics */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-amber" />
              Contribution analytics
            </h2>
            <p className="text-xs text-muted-foreground">
              Last 30 days · completed tasks and on-time rate
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Export PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={goToReports}>
              Open in Reports
            </Button>
          </div>
        </div>
        <Card variant="glass" className="overflow-hidden p-0">
          <div className="grid grid-cols-[1fr_70px_120px_80px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/40 px-4 py-2">
            <div>Person</div>
            <div className="text-right">Tasks</div>
            <div className="text-right">On-time</div>
            <div className="text-right">Open</div>
          </div>
          <ul className="divide-y divide-border/30">
            {contrib.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No team activity in the last 30 days.
              </li>
            ) : (
              contrib.map((c, i) => (
                <li
                  key={c.name}
                  className="grid grid-cols-[1fr_70px_120px_80px] items-center px-4 py-3 hover:bg-card/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums shrink-0">
                      {i + 1}
                    </div>
                    <PersonAvatar name={c.name} size="sm" />
                    <div className="text-sm truncate">{c.name}</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">{c.tasks}</div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress value={c.onTime} className="w-12 h-1" />
                      <span className="text-xs tabular-nums w-8 text-right">{c.onTime}%</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={c.blockers >= 4 ? 'warning' : 'soft'} className="text-[10px] tabular-nums">
                      {c.blockers}
                    </Badge>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>
      </section>

      {/* Workload balancing */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-mint" />
              Workload balancing
            </h2>
            <p className="text-xs text-muted-foreground">Redistribution opportunities from current capacity</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {visibleWorkload.length === 0 ? (
            <Card className="p-6 col-span-full text-center text-sm text-muted-foreground">
              Team workload looks balanced for the next two weeks.
            </Card>
          ) : (
            visibleWorkload.map((s, i) => (
              <Card key={`${s.from}-${s.to}-${i}`} className="p-3 bg-card/30">
                <div className="flex items-center gap-2 mb-2">
                  <PersonAvatar name={s.from} size="sm" />
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <PersonAvatar name={s.to} size="sm" />
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums mb-2">
                  <span className="text-warning">{s.fromLoad}%</span>
                  <span> → </span>
                  <span className="text-success">{s.toLoad}%</span>
                </div>
                <p className="text-xs leading-relaxed">{s.reasoning}</p>
                <div className="flex items-center gap-1 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] flex-1"
                    onClick={() => dismissWorkload(s.from)}
                  >
                    Dismiss
                  </Button>
                  <Button variant="gradient" size="sm" className="h-6 text-[10px] flex-1" onClick={goToReports}>
                    Open workload
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

function HealthCard({ project }: { project: HealthRow }) {
  const positive = project.delta.startsWith('+')
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
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Score</div>
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
      <div className="text-sm font-medium truncate">{project.project}</div>
      <div className="grid grid-cols-2 gap-1 mt-2 text-[10px] text-muted-foreground">
        <span>On-time: {project.dim.onTime}%</span>
        <span>Activity: {project.dim.activity}</span>
        <span className="capitalize col-span-2">Blockers: {project.dim.blockers}</span>
      </div>
    </Card>
  )
}
