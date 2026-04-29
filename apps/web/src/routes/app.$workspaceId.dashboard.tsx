import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@rundesk/ui'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { format, formatDistanceToNowStrict, isAfter, isBefore, isToday, startOfWeek } from 'date-fns'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'cancelled'

type TaskAssignee = {
  userId: string
  user?: { displayName?: string | null } | null
}

type Task = {
  id: string
  listId: string
  title: string
  status: TaskStatus
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  dueDate?: string | null
  completedAt?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  assignees?: TaskAssignee[] | null
}

type Workspace = { id: string; name: string }
type Space = { id: string; name: string; color?: string | null }
type Project = { id: string; name: string; spaceId: string }
type TaskList = { id: string; name: string; projectId: string }

type ListRef = { listId: string; spaceId: string; projectId: string }

export const Route = createFileRoute('/app/$workspaceId/dashboard')({
  component: Dashboard,
})

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Dashboard() {
  const { workspaceId } = Route.useParams()
  const user = useAuthStore((s) => s.user)
  const displayName = user?.displayName ?? 'there'
  const userId = user?.id

  const { data: workspace } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api<Workspace>(`/workspaces/${workspaceId}`),
  })

  // Fan out: spaces -> projects -> lists -> tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['dashboard-tasks', workspaceId],
    queryFn: async () => {
      const spaces = await api<Space[]>(`/spaces/workspace/${workspaceId}`)
      if (spaces.length === 0) return [] as Array<Task & ListRef>

      const projectGroups = await Promise.all(
        spaces.map(async (s) => {
          const projects = await api<Project[]>(`/projects/space/${s.id}`)
          return projects.map((p) => ({ spaceId: s.id, project: p }))
        }),
      )
      const projects = projectGroups.flat()
      if (projects.length === 0) return [] as Array<Task & ListRef>

      const listGroups = await Promise.all(
        projects.map(async ({ spaceId, project }) => {
          const lists = await api<TaskList[]>(`/lists/project/${project.id}`)
          return lists.map((l) => ({ spaceId, projectId: project.id, list: l }))
        }),
      )
      const lists = listGroups.flat()
      if (lists.length === 0) return [] as Array<Task & ListRef>

      const taskGroups = await Promise.all(
        lists.map(async ({ spaceId, projectId, list }) => {
          const ts = await api<Task[]>(`/tasks/list/${list.id}`)
          return ts.map((t) => ({ ...t, spaceId, projectId, listId: list.id }))
        }),
      )
      return taskGroups.flat()
    },
  })

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })

  const mine = tasks.filter((t) =>
    (t.assignees ?? []).some((a) => a.userId === userId),
  )

  const isActive = (t: Task) => t.status !== 'done' && t.status !== 'cancelled'

  const dueToday = mine
    .filter((t) => t.dueDate && isToday(new Date(t.dueDate)) && isActive(t))
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))

  const overdue = mine.filter(
    (t) =>
      t.dueDate &&
      isBefore(new Date(t.dueDate), now) &&
      !isToday(new Date(t.dueDate)) &&
      isActive(t),
  )

  const completedThisWeek = mine.filter(
    (t) =>
      t.status === 'done' &&
      t.completedAt &&
      isAfter(new Date(t.completedAt), weekStart),
  )

  const inProgress = mine.filter((t) => t.status === 'in_progress')

  const weekTotal = mine.filter((t) => {
    const ref = t.updatedAt ?? t.createdAt
    return ref ? isAfter(new Date(ref), weekStart) : false
  }).length
  const weekDone = completedThisWeek.length
  const completionPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0

  const myAssigned = mine
    .filter(isActive)
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return 0
    })
    .slice(0, 10)

  const recent = [...tasks]
    .filter((t) => t.updatedAt)
    .sort((a, b) => (a.updatedAt! < b.updatedAt! ? 1 : -1))
    .slice(0, 10)

  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Welcome header */}
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold text-foreground mb-1">
          {greeting()}, {displayName}
        </h1>
        <p className="text-muted-foreground">
          {format(now, 'EEEE, MMMM d, yyyy')}
          {workspace ? <> &middot; {workspace.name}</> : null}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Due today */}
        <WidgetCard
          title="Due today"
          icon={Clock}
          accent="brand"
          count={dueToday.length}
          loading={isLoading}
        >
          {dueToday.length === 0 ? (
            <EmptyLine>Nothing due today. Enjoy the calm.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {dueToday.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} workspaceId={workspaceId} />
              ))}
            </ul>
          )}
        </WidgetCard>

        {/* Overdue */}
        <WidgetCard
          title="Overdue"
          icon={AlertCircle}
          accent="red"
          count={overdue.length}
          loading={isLoading}
        >
          {overdue.length === 0 ? (
            <EmptyLine>All clear. No overdue tasks.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {overdue.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} workspaceId={workspaceId} tone="red" />
              ))}
            </ul>
          )}
        </WidgetCard>

        {/* Completed this week */}
        <WidgetCard
          title="Completed this week"
          icon={CheckCircle2}
          accent="green"
          count={completedThisWeek.length}
          loading={isLoading}
        >
          <p className="text-xs text-muted-foreground">
            Wins logged since Monday. Keep the streak going.
          </p>
        </WidgetCard>

        {/* In progress */}
        <WidgetCard
          title="In progress"
          icon={TrendingUp}
          accent="blue"
          count={inProgress.length}
          loading={isLoading}
        >
          <p className="text-xs text-muted-foreground">
            Active tasks on your plate right now.
          </p>
        </WidgetCard>

        {/* Completion ring */}
        <Card className="p-5 md:col-span-2 lg:col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                This week&rsquo;s completion
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tasks you finished vs. tasks touched this week.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <CompletionRing pct={completionPct} />
            <div className="space-y-1.5">
              <LegendDot color="hsl(var(--brand-700))" label={`${weekDone} completed`} />
              <LegendDot color="hsl(var(--muted))" label={`${Math.max(weekTotal - weekDone, 0)} remaining`} />
              <div className="text-xs text-muted-foreground pt-1">
                {weekTotal === 0
                  ? 'No activity logged this week yet.'
                  : `Based on ${weekTotal} tracked task${weekTotal === 1 ? '' : 's'}.`}
              </div>
            </div>
          </div>
        </Card>

        {/* My assigned tasks - spans 2 cols */}
        <Card className="p-5 md:col-span-2 lg:col-span-2 row-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                My assigned tasks
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your next 10 open tasks, sorted by due date.
              </p>
            </div>
            <span className="text-xs font-medium rounded-full bg-brand-100 text-accent px-2 py-0.5">
              {myAssigned.length}
            </span>
          </div>
          {myAssigned.length === 0 ? (
            <EmptyLine>Nothing assigned to you yet.</EmptyLine>
          ) : (
            <ul className="divide-y divide-border">
              {myAssigned.map((t) => (
                <li key={t.id} className="py-2 first:pt-0 last:pb-0">
                  <TaskRow task={t} workspaceId={workspaceId} verbose />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-5 md:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                Recent activity
              </h2>
            </div>
          </div>
          {recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No recent activity yet. Updates to tasks will show up here.
            </div>
          ) : (
            <ul className="space-y-2">
              {recent.map((t) => (
                <li key={t.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/app/$workspaceId/$spaceId/$projectId/$listId"
                      params={{
                        workspaceId,
                        spaceId: (t as Task & ListRef).spaceId,
                        projectId: (t as Task & ListRef).projectId,
                        listId: t.listId,
                      }}
                      className="font-medium truncate hover:text-accent transition-colors block"
                    >
                      {t.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {(t.assignees ?? [])[0]?.user?.displayName ?? 'Someone'}
                      {' · '}
                      {t.updatedAt
                        ? formatDistanceToNowStrict(new Date(t.updatedAt), {
                            addSuffix: true,
                          })
                        : 'recently'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function WidgetCard({
  title,
  icon: Icon,
  accent,
  count,
  loading,
  children,
}: {
  title: string
  icon: typeof CheckCircle2
  accent: 'brand' | 'red' | 'green' | 'blue'
  count: number
  loading?: boolean
  children: React.ReactNode
}) {
  const accentClasses = {
    brand: 'bg-brand-100 text-accent',
    red: 'bg-red-100 text-red-700',
    green: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
  }[accent]

  const borderAccent = {
    brand: '',
    red: 'border-l-4 border-l-red-500',
    green: 'border-l-4 border-l-emerald-500',
    blue: 'border-l-4 border-l-blue-500',
  }[accent]

  return (
    <Card className={`p-4 ${borderAccent}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <span
          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${accentClasses}`}
        >
          {loading ? '…' : count}
        </span>
      </div>
      <div className="font-display text-3xl font-semibold text-foreground mb-2">
        {loading ? '—' : count}
      </div>
      {children}
    </Card>
  )
}

function TaskRow({
  task,
  workspaceId,
  tone,
  verbose,
}: {
  task: Task & Partial<ListRef>
  workspaceId: string
  tone?: 'red'
  verbose?: boolean
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null
  const canLink = task.spaceId && task.projectId && task.listId
  const content = (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          tone === 'red' ? 'bg-red-500' : 'bg-brand-700'
        }`}
      />
      <span className="truncate text-sm flex-1">{task.title}</span>
      {verbose && due ? (
        <span className="text-xs text-muted-foreground shrink-0">
          {format(due, 'MMM d')}
        </span>
      ) : null}
    </div>
  )

  if (!canLink) {
    return <div className="py-0.5">{content}</div>
  }

  return (
    <Link
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{
        workspaceId,
        spaceId: task.spaceId!,
        projectId: task.projectId!,
        listId: task.listId,
      }}
      className="block hover:text-accent transition-colors"
    >
      {content}
    </Link>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 120
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(pct, 0), 100)
  const dash = (clamped / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--brand-700))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          fill="none"
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-2xl font-semibold text-foreground">
          {clamped}%
        </span>
      </div>
    </div>
  )
}
