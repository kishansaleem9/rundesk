import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, CheckCircle2, Circle, CircleDashed, Diamond, Calendar } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export const Route = createFileRoute('/portal/$token')({
  component: ClientPortalPage,
})

type StatusCategory = 'open' | 'in_progress' | 'closed'

type PortalTask = {
  id: string
  title: string
  status: string
  statusCategory: StatusCategory
  statusColor: string | null
  dueDate: string | null
  isMilestone: boolean
}

type PortalView = {
  portal: { name: string }
  project: { name: string }
  client: { name: string } | null
  workspace: {
    name: string
    logoUrl: string | null
    primaryColor: string | null
    accentColor: string | null
  }
  showCompleted: boolean
  progress: { total: number; completed: number; percent: number }
  tasks: PortalTask[]
}

// Client-facing reading order: what's active first, then upcoming, then done.
const GROUP_ORDER: StatusCategory[] = ['in_progress', 'open', 'closed']

function ClientPortalPage() {
  const { t, locale } = useTranslation()
  const { token } = Route.useParams()

  const portalQuery = useQuery({
    queryKey: ['client-portal', token],
    queryFn: () => api<PortalView>(`/portal/${token}`, { skipAuth: true }),
    retry: false,
    // Real-time-ish: refresh task status on an interval while the page is open.
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })

  if (portalQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  if (portalQuery.isError || !portalQuery.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-background px-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold">{t('clientPortal.notFoundTitle')}</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-sm">{t('clientPortal.notFoundBody')}</p>
        </div>
      </div>
    )
  }

  const view = portalQuery.data
  const primary = view.workspace.primaryColor || '#354fb0'
  const accent = view.workspace.accentColor || primary

  const groups = GROUP_ORDER.map((cat) => ({
    cat,
    label:
      cat === 'in_progress'
        ? t('clientPortal.statusInProgress')
        : cat === 'open'
          ? t('clientPortal.statusOpen')
          : t('clientPortal.statusCompleted'),
    tasks: view.tasks.filter((task) => task.statusCategory === cat),
  })).filter((g) => g.tasks.length > 0)

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-background">
      {/* Branded header */}
      <header className="border-b border-border/60" style={{ borderTopColor: primary, borderTopWidth: 4 }}>
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="flex items-center gap-3">
            {view.workspace.logoUrl ? (
              <img
                src={view.workspace.logoUrl}
                alt={view.workspace.name}
                className="h-10 w-10 rounded-lg object-contain bg-white/60"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: primary }}
              >
                {view.workspace.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground truncate">{view.workspace.name}</p>
            </div>
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{view.portal.name}</h1>
          {view.client && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('clientPortal.clientLabel', { client: view.client.name })}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Progress */}
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('clientPortal.progressLabel')}</span>
            <span className="text-sm font-semibold" style={{ color: accent }}>
              {view.progress.percent}%
            </span>
          </div>
          <div className="mt-3 h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${view.progress.percent}%`, backgroundColor: accent }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('clientPortal.tasksComplete', {
              completed: String(view.progress.completed),
              total: String(view.progress.total),
            })}
          </p>
        </section>

        {/* Task groups */}
        <div className="mt-8 space-y-8">
          {groups.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">{t('clientPortal.noTasks')}</p>
          ) : (
            groups.map((group) => (
              <section key={group.cat}>
                <div className="flex items-center gap-2 mb-3">
                  <GroupIcon cat={group.cat} />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h2>
                  <span className="text-xs text-muted-foreground">({group.tasks.length})</span>
                </div>
                <ul className="space-y-2">
                  {group.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <span className="mt-0.5">
                        <GroupIcon cat={task.statusCategory} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-medium ${
                              task.statusCategory === 'closed' ? 'line-through text-muted-foreground' : ''
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.isMilestone && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: `${accent}1a`, color: accent }}
                            >
                              <Diamond className="h-2.5 w-2.5" /> {t('clientPortal.milestone')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                            style={{
                              backgroundColor: task.statusColor ? `${task.statusColor}1a` : undefined,
                              color: task.statusColor ?? undefined,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: task.statusColor ?? 'currentColor' }}
                            />
                            {task.status}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {task.dueDate ? dateFmt(task.dueDate) : t('clientPortal.noDueDate')}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <footer className="mt-16 border-t border-border/40 pt-4 text-center text-[11px] text-muted-foreground">
          {t('clientPortal.readOnlyNote')} · {t('clientPortal.poweredBy')}
        </footer>
      </main>
    </div>
  )
}

function GroupIcon({ cat }: { cat: StatusCategory }) {
  if (cat === 'closed') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (cat === 'in_progress') return <CircleDashed className="h-4 w-4 text-blue-500" />
  return <Circle className="h-4 w-4 text-muted-foreground" />
}
