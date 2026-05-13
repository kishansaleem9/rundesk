import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  Badge,
  Button,
  Progress,
  PersonAvatar,
  cn,
} from '@rundesk/ui'
import {
  ArrowLeft,
  Target,
  TrendingUp,
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/goals/$goalId')({
  component: GoalDetailPage,
})

const OBJECTIVE = {
  id: 'q3-launch',
  title: 'Launch Rundesk v1.0 to internal team',
  description: 'Replace ClickUp internally and validate the AI-first PM thesis with real users.',
  owner: 'Afzaal Ali',
  cycle: 'Q3 2026',
  due: '2026-09-30',
  progress: 64,
  status: 'on_track' as const,
}

type KR = {
  id: string
  title: string
  metric: string
  target: number
  current: number
  unit: '%' | 'count'
  owner: string
  status: 'on_track' | 'at_risk' | 'off_track' | 'completed'
  history: number[] // 8 weekly snapshots
}

const KEY_RESULTS: KR[] = [
  {
    id: 'kr1',
    title: 'Migrate every internal team to Rundesk',
    metric: 'Teams migrated',
    target: 6,
    current: 4,
    unit: 'count',
    owner: 'Hamda Tahir',
    status: 'on_track',
    history: [0, 0, 1, 2, 2, 3, 3, 4],
  },
  {
    id: 'kr2',
    title: 'Reach 90% weekly active among migrated users',
    metric: 'WAU rate',
    target: 90,
    current: 72,
    unit: '%',
    owner: 'Iqra Khalid',
    status: 'at_risk',
    history: [40, 48, 55, 60, 62, 65, 68, 72],
  },
  {
    id: 'kr3',
    title: 'AI agent answers ≥ 50% of workspace questions',
    metric: 'AI answer rate',
    target: 50,
    current: 38,
    unit: '%',
    owner: 'Afzaal Ali',
    status: 'on_track',
    history: [10, 14, 18, 22, 26, 30, 34, 38],
  },
  {
    id: 'kr4',
    title: 'Reduce avg PM tool spend per seat by 60%',
    metric: 'Spend reduction',
    target: 60,
    current: 60,
    unit: '%',
    owner: 'Bilal Khan',
    status: 'completed',
    history: [10, 18, 28, 36, 44, 52, 58, 60],
  },
  {
    id: 'kr5',
    title: 'Ship every P0 v1.0 feature from the hierarchy',
    metric: 'Features shipped',
    target: 100,
    current: 78,
    unit: '%',
    owner: 'Mali Acme',
    status: 'on_track',
    history: [12, 22, 35, 46, 58, 66, 72, 78],
  },
]

const STATUS_META = {
  on_track: { label: 'On track', color: 'text-success', badge: 'success' as const, icon: TrendingUp },
  at_risk: { label: 'At risk', color: 'text-warning', badge: 'warning' as const, icon: AlertTriangle },
  off_track: { label: 'Off track', color: 'text-destructive', badge: 'destructive' as const, icon: AlertTriangle },
  completed: { label: 'Completed', color: 'text-success', badge: 'success' as const, icon: CheckCircle2 },
}

export function GoalDetailPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
        <Link to="..">
          <ArrowLeft className="h-3.5 w-3.5" /> All goals
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            Objective
            <Badge variant={STATUS_META[OBJECTIVE.status].badge} className="text-[9px] uppercase">
              {STATUS_META[OBJECTIVE.status].label}
            </Badge>
          </div>
          <h1 className="font-display text-3xl font-semibold flex items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow shrink-0 mt-1">
              <Target className="h-4 w-4" />
            </span>
            <span>{OBJECTIVE.title}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            {OBJECTIVE.description}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-3">
            <span className="flex items-center gap-1.5">
              <PersonAvatar name={OBJECTIVE.owner} size="sm" />
              {OBJECTIVE.owner}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {OBJECTIVE.cycle} · due {fmt(OBJECTIVE.due)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">Edit</Button>
          <Button variant="gradient" size="sm">
            <Plus className="h-3.5 w-3.5" /> Add key result
          </Button>
        </div>
      </div>

      {/* Rolled-up progress card */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Objective progress</div>
            <div className="font-display text-3xl font-semibold tabular-nums">{OBJECTIVE.progress}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Average of {KEY_RESULTS.length} key results
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Trending</span>
            <span className="text-success text-sm font-medium">+12% this week</span>
          </div>
        </div>
        <Progress value={OBJECTIVE.progress} className="h-2" />
      </Card>

      {/* OKR tree */}
      <section>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">
          Key results
        </h2>
        <div className="relative pl-6">
          {/* Vertical spine */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-accent/60 via-accent/30 to-transparent" />
          <div className="space-y-3">
            {KEY_RESULTS.map((kr, i) => (
              <KeyResultCard key={kr.id} kr={kr} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Linked items */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Linked work</h3>
            <p className="text-xs text-muted-foreground">Projects and lists driving this objective.</p>
          </div>
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" /> Link a project
          </Button>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { name: 'v1.0 launch', tasks: '24/30 tasks', pct: 80 },
            { name: 'AI agent rollout', tasks: '12/22 tasks', pct: 55 },
            { name: 'Migration playbook', tasks: '6/8 tasks', pct: 75 },
            { name: 'Cost-savings analysis', tasks: '4/4 tasks', pct: 100 },
          ].map((p) => (
            <li
              key={p.name}
              className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
                <Users className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">{p.tasks}</div>
              </div>
              <span className="text-xs tabular-nums shrink-0">{p.pct}%</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function KeyResultCard({ kr, index }: { kr: KR; index: number }) {
  const meta = STATUS_META[kr.status]
  const StatusIcon = meta.icon
  const pct = Math.min(100, Math.round((kr.current / kr.target) * 100))
  return (
    <div className="relative">
      {/* Connector dot */}
      <div className="absolute -left-[14px] top-5 flex h-3 w-3 items-center justify-center">
        <div className={cn('h-3 w-3 rounded-full', kr.status === 'completed' ? 'bg-success' : 'bg-accent')} />
        <div className={cn('absolute h-3 w-3 rounded-full animate-ping opacity-50', kr.status === 'completed' ? 'bg-success' : 'bg-accent')} />
      </div>
      <Card variant="glass" className="p-4 hover:border-accent/40 transition-colors">
        <div className="flex items-start gap-4">
          <Badge variant="soft" className="font-mono text-[9px] uppercase mt-0.5">
            KR{index + 1}
          </Badge>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
              <span className="font-medium">{kr.title}</span>
              <Badge variant={meta.badge} className="text-[9px] uppercase shrink-0">
                <StatusIcon className="h-2.5 w-2.5" />
                {meta.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
              <span>
                {kr.metric}: <span className="text-foreground font-medium tabular-nums">
                  {kr.current}{kr.unit === '%' ? '%' : ''} / {kr.target}{kr.unit === '%' ? '%' : ''}
                </span>
              </span>
              <span>·</span>
              <PersonAvatar name={kr.owner} size="sm" />
              <span>{kr.owner}</span>
            </div>
            <div className="flex items-center gap-3">
              <Progress
                value={pct}
                indicatorClassName={cn(
                  kr.status === 'completed' && 'bg-success',
                  kr.status === 'at_risk' && 'bg-warning',
                  kr.status === 'off_track' && 'bg-destructive',
                )}
              />
              <span className="text-xs font-medium tabular-nums w-10 text-right">{pct}%</span>
              <Sparkline values={kr.history} className="shrink-0" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const W = 60
  const H = 20
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - ((v - min) / span) * (H - 2) - 1
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className}>
      <path d={d} stroke="hsl(var(--accent))" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
