import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Card,
  Badge,
  Button,
  PersonAvatar,
  Progress,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  cn,
} from '@rundesk/ui'
import {
  ArrowLeft,
  Sparkles,
  Calendar,
  TrendingUp,
  Target,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/sprints/$sprintId')({
  component: SprintDetailPage,
})

// ───────────────────────────────────────────────────────────────────────────
// Mock data
// ───────────────────────────────────────────────────────────────────────────
const SPRINT = {
  id: 's1',
  name: 'Sprint 14',
  goal: 'Ship the new onboarding flow + fix critical timeline bugs',
  startDate: '2026-04-22',
  endDate: '2026-05-05',
  status: 'active' as const,
  totalPoints: 42,
  completedPoints: 26,
  totalTasks: 18,
  completedTasks: 11,
}

// 14-day burndown — ideal vs actual
const BURNDOWN: Array<{ day: string; ideal: number; actual: number | null }> = [
  { day: 'Apr 22', ideal: 42, actual: 42 },
  { day: 'Apr 23', ideal: 39, actual: 41 },
  { day: 'Apr 24', ideal: 36, actual: 38 },
  { day: 'Apr 25', ideal: 33, actual: 35 },
  { day: 'Apr 26', ideal: 30, actual: 33 },
  { day: 'Apr 27', ideal: 27, actual: 28 },
  { day: 'Apr 28', ideal: 24, actual: 22 },
  { day: 'Apr 29', ideal: 21, actual: 16 },
  { day: 'Apr 30', ideal: 18, actual: null },
  { day: 'May 1', ideal: 15, actual: null },
  { day: 'May 2', ideal: 12, actual: null },
  { day: 'May 3', ideal: 9, actual: null },
  { day: 'May 4', ideal: 6, actual: null },
  { day: 'May 5', ideal: 0, actual: null },
]

// Velocity history — last 6 sprints
const VELOCITY = [
  { sprint: 'Sprint 9', planned: 35, completed: 32 },
  { sprint: 'Sprint 10', planned: 38, completed: 38 },
  { sprint: 'Sprint 11', planned: 40, completed: 35 },
  { sprint: 'Sprint 12', planned: 42, completed: 40 },
  { sprint: 'Sprint 13', planned: 45, completed: 41 },
  { sprint: 'Sprint 14', planned: 42, completed: 26 },
]

const TASKS = [
  { id: 'RD-1B23', title: 'Multi-step onboarding wizard', assignee: 'Afzaal Ali', points: 8, status: 'done' },
  { id: 'RD-2C44', title: 'Fix Timeline header overlap', assignee: 'Hamda Tahir', points: 3, status: 'done' },
  { id: 'RD-3D56', title: 'Workload heat-map view', assignee: 'Iqra Khalid', points: 5, status: 'done' },
  { id: 'RD-4F22', title: 'Dark-first design tokens', assignee: 'Afzaal Ali', points: 5, status: 'done' },
  { id: 'RD-5A11', title: 'Custom roles builder UI', assignee: 'Mali Acme', points: 8, status: 'in_progress' },
  { id: 'RD-6G77', title: 'Sprint burndown chart', assignee: 'Iqra Khalid', points: 3, status: 'in_progress' },
  { id: 'RD-7H88', title: 'Email-to-task setup panel', assignee: 'Sara Idris', points: 5, status: 'todo' },
  { id: 'RD-8J99', title: 'Public share dialog', assignee: 'Bilal Khan', points: 5, status: 'todo' },
] as const

function SprintDetailPage() {
  const completedPct = (SPRINT.completedPoints / SPRINT.totalPoints) * 100
  const taskPct = (SPRINT.completedTasks / SPRINT.totalTasks) * 100
  const onTrack = SPRINT.completedPoints >= 21 // ideal at day 7

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
          <Link to="..">
            <ArrowLeft className="h-3.5 w-3.5" /> All sprints
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
              Active sprint
              <Badge variant="success" className="text-[9px] uppercase">
                In progress
              </Badge>
            </div>
            <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
                <Sparkles className="h-4 w-4" />
              </span>
              {SPRINT.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              <Target className="inline h-3.5 w-3.5 mr-1" />
              {SPRINT.goal}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmt(SPRINT.startDate)} — {fmt(SPRINT.endDate)}
              </span>
              <span>·</span>
              <span>Day 7 of 14</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Add task
            </Button>
            <Button variant="gradient" size="sm">
              Close sprint
            </Button>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Story points" value={`${SPRINT.completedPoints}/${SPRINT.totalPoints}`} percent={completedPct} />
        <StatTile label="Tasks" value={`${SPRINT.completedTasks}/${SPRINT.totalTasks}`} percent={taskPct} />
        <StatTile
          label="Pace"
          value={onTrack ? 'On track' : 'Slightly behind'}
          tone={onTrack ? 'success' : 'warning'}
          icon={onTrack ? CheckCircle2 : AlertTriangle}
        />
        <StatTile
          label="Avg velocity"
          value={`${Math.round(VELOCITY.reduce((a, b) => a + b.completed, 0) / VELOCITY.length)} pts`}
          tone="info"
          icon={TrendingUp}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="glass" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Burndown</h3>
              <p className="text-xs text-muted-foreground">Story points remaining vs ideal</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <span className="h-2 w-3 rounded-sm border border-dashed border-muted-foreground" /> Ideal
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-brand-gradient" /> Actual
              </span>
            </div>
          </div>
          <BurndownChart data={BURNDOWN} />
        </Card>

        <Card variant="glass" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Velocity</h3>
              <p className="text-xs text-muted-foreground">Last 6 sprints — planned vs completed</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-muted" /> Planned
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-brand-gradient" /> Completed
              </span>
            </div>
          </div>
          <VelocityChart data={VELOCITY} />
        </Card>
      </div>

      {/* Backlog */}
      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40">
          <h3 className="font-display text-lg font-semibold">Sprint backlog</h3>
        </div>
        <ul className="divide-y divide-border/30">
          {TASKS.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-5 py-2.5 hover:bg-card/40 transition-colors"
            >
              {t.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : t.status === 'in_progress' ? (
                <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
                  <span className="absolute h-3 w-3 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                </span>
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <Badge variant="soft" className="font-mono text-[9px] uppercase shrink-0">{t.id}</Badge>
              <div className={cn('flex-1 truncate text-sm', t.status === 'done' && 'line-through text-muted-foreground')}>
                {t.title}
              </div>
              <Badge variant="info" className="text-[9px] tabular-nums shrink-0">{t.points} pt</Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0">
                    <PersonAvatar name={t.assignee} size="sm" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t.assignee}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatTile({
  label,
  value,
  percent,
  tone = 'default',
  icon: Icon,
}: {
  label: string
  value: string
  percent?: number
  tone?: 'default' | 'success' | 'warning' | 'info'
  icon?: React.ElementType
}) {
  return (
    <Card variant="glass" className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
        {label}
        {Icon && (
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              tone === 'success' && 'text-success',
              tone === 'warning' && 'text-warning',
              tone === 'info' && 'text-accent',
            )}
          />
        )}
      </div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      {percent !== undefined && <Progress value={percent} className="mt-3 h-1.5" />}
    </Card>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Charts (hand-built SVG so we don't pull in another lib)
// ───────────────────────────────────────────────────────────────────────────

function BurndownChart({ data }: { data: typeof BURNDOWN }) {
  const W = 540
  const H = 200
  const pad = { top: 12, right: 8, bottom: 24, left: 28 }
  const max = Math.max(...data.map((d) => d.ideal))
  const x = (i: number) => pad.left + (i / (data.length - 1)) * (W - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)

  const idealPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.ideal)}`).join(' ')
  const actualPts = data.filter((d) => d.actual !== null) as Array<{ day: string; ideal: number; actual: number }>
  const actualPath = actualPts
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(data.indexOf(d))} ${y(d.actual)}`)
    .join(' ')

  const yTicks = [0, max / 2, max]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="actual-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.45" />
          <stop offset="100%" stopColor="hsl(var(--accent-violet))" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="actual-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--brand-700))" />
          <stop offset="50%" stopColor="hsl(var(--accent-violet))" />
          <stop offset="100%" stopColor="hsl(var(--accent-pink))" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
            strokeOpacity="0.6"
          />
          <text x={pad.left - 6} y={y(t) + 4} fontSize="10" fill="hsl(var(--muted-foreground))" textAnchor="end">
            {Math.round(t)}
          </text>
        </g>
      ))}

      {/* Ideal line */}
      <path d={idealPath} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.7" />

      {/* Actual area */}
      {actualPts.length > 1 && (
        <path
          d={`${actualPath} L ${x(data.indexOf(actualPts[actualPts.length - 1]))} ${H - pad.bottom} L ${x(0)} ${H - pad.bottom} Z`}
          fill="url(#actual-grad)"
        />
      )}
      {/* Actual line */}
      <path d={actualPath} fill="none" stroke="url(#actual-stroke)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Actual dots */}
      {actualPts.map((d, i) => (
        <circle key={i} cx={x(data.indexOf(d))} cy={y(d.actual)} r="3" fill="hsl(var(--accent-violet))" stroke="hsl(var(--background))" strokeWidth="2" />
      ))}

      {/* X labels — show every other */}
      {data.map((d, i) =>
        i % 3 === 0 || i === data.length - 1 ? (
          <text key={i} x={x(i)} y={H - 6} fontSize="9.5" fill="hsl(var(--muted-foreground))" textAnchor="middle">
            {d.day}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function VelocityChart({ data }: { data: typeof VELOCITY }) {
  const W = 540
  const H = 200
  const pad = { top: 12, right: 8, bottom: 24, left: 28 }
  const max = Math.max(...data.flatMap((d) => [d.planned, d.completed])) * 1.1
  const groupW = (W - pad.left - pad.right) / data.length
  const barW = groupW / 3
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent-violet))" />
          <stop offset="100%" stopColor="hsl(var(--brand-700))" />
        </linearGradient>
      </defs>

      {[0, max / 2, max].map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="2 4" strokeOpacity="0.6" />
          <text x={pad.left - 6} y={y(t) + 4} fontSize="10" fill="hsl(var(--muted-foreground))" textAnchor="end">
            {Math.round(t)}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const groupX = pad.left + i * groupW + groupW / 2
        return (
          <g key={d.sprint}>
            <rect
              x={groupX - barW - 1}
              y={y(d.planned)}
              width={barW}
              height={H - pad.bottom - y(d.planned)}
              fill="hsl(var(--muted))"
              rx="2"
            />
            <rect
              x={groupX + 1}
              y={y(d.completed)}
              width={barW}
              height={H - pad.bottom - y(d.completed)}
              fill="url(#bar-grad)"
              rx="2"
            />
            <text x={groupX} y={H - 6} fontSize="9.5" fill="hsl(var(--muted-foreground))" textAnchor="middle">
              {d.sprint.replace('Sprint ', 'S')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
