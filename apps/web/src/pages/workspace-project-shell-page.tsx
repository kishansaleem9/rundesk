import { useState } from 'react'
import { Outlet, useMatches, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Card, Badge, cn, toast } from '@rundesk/ui'
import { List as ListIcon, Plus, Settings, Trash2, Users, CircleDot, DollarSign, Activity, Sparkles, Copy, Loader2, X, HeartPulse } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import {
  WorkHubPage,
  WorkEmptyState,
  WorkEntityCard,
  WorkCreateCard,
  WorkSectionTitle,
} from '../components/work/work-ui'
import { ContainerMembersSheet } from '../components/container-members-sheet'
import { ScopedStatusesManager } from '../components/list-statuses-manager'

type List = {
  id: string
  name: string
  description?: string | null
}

type Project = { id: string; name: string; description?: string | null; visibility?: string | null }

export function ProjectShell() {
  const matches = useMatches()
  const isNested = matches.some(
    (m) =>
      m.routeId !== '/app/$workspaceId/$spaceId/$projectId' &&
      m.routeId.startsWith('/app/$workspaceId/$spaceId/$projectId/'),
  )
  if (isNested) return <Outlet />
  return <ProjectHome />
}

function ProjectHome() {
  const { t, tCount } = useTranslation()
  const { workspaceId, spaceId, projectId } = useParams({
    from: '/app/$workspaceId/$spaceId/$projectId',
  })
  const qc = useQueryClient()
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [dragListId, setDragListId] = useState<string | null>(null)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', spaceId],
    queryFn: () => api<Project[]>(`/projects/space/${spaceId}`),
  })
  const project = projects.find((p) => p.id === projectId)

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['lists', projectId],
    queryFn: () => api<List[]>(`/lists/project/${projectId}`),
  })

  const reorderLists = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api(`/lists/project/${projectId}/reorder`, { method: 'POST', body: { orderedIds } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists', projectId] }),
  })
  const handleListDrop = (targetId: string) => {
    if (!dragListId || dragListId === targetId) {
      setDragListId(null)
      return
    }
    const ids = lists.map((l) => l.id)
    const from = ids.indexOf(dragListId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragListId(null)
      return
    }
    ids.splice(to, 0, ids.splice(from, 1)[0])
    reorderLists.mutate(ids)
    setDragListId(null)
  }

  const createList = useMutation({
    mutationFn: () =>
      api<List>(`/lists`, {
        method: 'POST',
        body: {
          projectId,
          name: newListName.trim(),
          description: newListDescription.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setShowCreateList(false)
      setNewListName('')
      setNewListDescription('')
      qc.invalidateQueries({ queryKey: ['lists', projectId] })
    },
  })

  return (
    <WorkHubPage
      breadcrumb={t('projectShell.breadcrumb')}
      title={project?.name ?? t('projectShell.titleFallback')}
      description={project?.description}
      headerAction={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setStatusesOpen(true)}>
            <CircleDot className="h-3.5 w-3.5 mr-1.5" />
            {t('projectShell.statuses')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {t('projectShell.members')}
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setShowCreateList((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {showCreateList ? t('common.cancel') : t('projectShell.addList')}
          </Button>
        </div>
      }
    >
      <section className="mb-10">
        <WorkSectionTitle
          action={
            <span className="text-[12px] text-muted-foreground">
              {tCount('projectShell.listCount', lists.length)}
            </span>
          }
        >
          {t('projectShell.lists')}
        </WorkSectionTitle>

        {showCreateList && (
          <WorkCreateCard onCancel={() => setShowCreateList(false)}>
            <Input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder={t('projectShell.listNamePlaceholder')}
              className="h-9"
            />
            <Input
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              placeholder={t('projectShell.descriptionPlaceholder')}
              className="h-9"
            />
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => createList.mutate()}
              disabled={!newListName.trim() || createList.isPending}
            >
              {createList.isPending ? t('projectShell.creating') : t('projectShell.createList')}
            </Button>
          </WorkCreateCard>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border/80 p-8 text-center text-[13px] text-muted-foreground">
            {t('projectShell.loadingLists')}
          </div>
        ) : lists.length === 0 ? (
          <WorkEmptyState
            icon={ListIcon}
            title={t('projectShell.noListsTitle')}
            description={t('projectShell.noListsBody')}
            action={
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => setShowCreateList(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" /> {t('projectShell.addList')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lists.map((list) => (
              <div
                key={list.id}
                draggable
                onDragStart={() => setDragListId(list.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleListDrop(list.id)}
                onDragEnd={() => setDragListId(null)}
                className={cn('cursor-grab active:cursor-grabbing', dragListId === list.id && 'opacity-50')}
                title={t('projectShell.dragToReorder')}
              >
                <ListCard
                  list={list}
                  workspaceId={workspaceId}
                  spaceId={spaceId}
                  projectId={projectId}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <ProjectHealthSection workspaceId={workspaceId} projectId={projectId} />

      <CustomFieldsSection workspaceId={workspaceId} projectId={projectId} />

      <ProjectActivitySection projectId={projectId} workspaceId={workspaceId} projectName={project?.name} />

      <ProjectTimeSettingsSection projectId={projectId} workspaceId={workspaceId} />

      <ContainerMembersSheet
        kind="project"
        containerId={projectId}
        workspaceId={workspaceId}
        containerName={project?.name}
        initialVisibility={project?.visibility ?? null}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />

      <ScopedStatusesManager
        scope="project"
        containerId={projectId}
        containerName={project?.name}
        open={statusesOpen}
        onOpenChange={setStatusesOpen}
      />
    </WorkHubPage>
  )
}

// §7.13 — persisted daily project-health trend. Shows the current band + score,
// comment sentiment, and a 30-day sparkline read from project_health_scores.
type HealthTrend = {
  projectId: string
  days: number
  current: {
    score: number
    band: string
    sentiment: { score: number; label: string; samples: number } | null
  } | null
  points: Array<{ date: string; score: number; band: string }>
}

function HealthSparkline({ points }: { points: Array<{ date: string; score: number }> }) {
  const W = 240
  const H = 44
  const pad = 3
  const n = points.length
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * pad)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11" preserveAspectRatio="none" role="img" aria-label="30-day health trend">
      {/* Green-band reference line at 75. */}
      <line x1={pad} y1={y(75)} x2={W - pad} y2={y(75)} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function ProjectHealthSection({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['project-health-trend', workspaceId, projectId],
    queryFn: () =>
      api<HealthTrend>(`/workspaces/${workspaceId}/reports/project-health/trend?projectId=${projectId}&days=30`),
  })

  const bandLabel = (band?: string) =>
    band === 'green'
      ? t('projectShell.bandGreen')
      : band === 'yellow'
        ? t('projectShell.bandYellow')
        : band === 'red'
          ? t('projectShell.bandRed')
          : t('projectShell.bandEmpty')
  const bandVariant = (band?: string): 'success' | 'warning' | 'destructive' | 'soft' =>
    band === 'green' ? 'success' : band === 'yellow' ? 'warning' : band === 'red' ? 'destructive' : 'soft'
  const sentimentLabel = (label?: string) =>
    label === 'positive'
      ? t('projectShell.sentimentPositive')
      : label === 'negative'
        ? t('projectShell.sentimentNegative')
        : t('projectShell.sentimentNeutral')

  const points = data?.points ?? []
  const current = data?.current ?? null

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-pink-500" />
          {t('projectShell.healthTitle')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">{t('projectShell.healthDesc')}</p>

      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80">{t('common.loading')}</Card>
      ) : !current || points.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.healthNoData')}
        </Card>
      ) : (
        <Card className="p-4 border-border/80">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                {t('projectShell.healthScoreLabel')}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">{current.score}</span>
                <Badge variant={bandVariant(current.band)}>{bandLabel(current.band)}</Badge>
              </div>
            </div>
            {current.sentiment && current.sentiment.samples > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                  {t('projectShell.healthSentimentLabel')}
                </div>
                <div className="text-sm">
                  {sentimentLabel(current.sentiment.label)}{' '}
                  <span className="text-muted-foreground tabular-nums">({current.sentiment.score})</span>
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                {t('projectShell.healthTrendLabel')}
              </div>
              <HealthSparkline points={points} />
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

type CustomFieldDef = {
  id: string
  name: string
  type: 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url' | 'email' | 'phone' | 'money' | 'rating'
  isRequired: boolean
  options: Array<{ label: string; value: string }> | null
}

// The `value` is the persisted field-type identifier; `labelKey` references an
// i18n catalog entry resolved at render time.
const FIELD_TYPE_OPTIONS = [
  { value: 'text', labelKey: 'projectShell.fieldType.text' },
  { value: 'number', labelKey: 'projectShell.fieldType.number' },
  { value: 'dropdown', labelKey: 'projectShell.fieldType.dropdown' },
  { value: 'date', labelKey: 'projectShell.fieldType.date' },
  { value: 'checkbox', labelKey: 'projectShell.fieldType.checkbox' },
  { value: 'url', labelKey: 'projectShell.fieldType.url' },
  { value: 'email', labelKey: 'projectShell.fieldType.email' },
  { value: 'phone', labelKey: 'projectShell.fieldType.phone' },
  { value: 'money', labelKey: 'projectShell.fieldType.money' },
  { value: 'rating', labelKey: 'projectShell.fieldType.rating' },
] as const

function CustomFieldsSection({
  workspaceId,
  projectId,
}: {
  workspaceId: string
  projectId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomFieldDef['type']>('text')
  const [isRequired, setIsRequired] = useState(false)
  const [options, setOptions] = useState('')

  const fieldsQuery = useQuery({
    queryKey: ['project-fields', workspaceId, projectId],
    queryFn: () =>
      api<CustomFieldDef[]>(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`),
  })

  const create = useMutation({
    mutationFn: () => {
      const opts =
        type === 'dropdown'
          ? options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean)
              .map((o) => ({ label: o, value: o.toLowerCase().replace(/\s+/g, '_') }))
          : undefined
      return api(`/workspaces/${workspaceId}/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body: { name, type, isRequired, options: opts },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] })
      setShowForm(false)
      setName('')
      setIsRequired(false)
      setOptions('')
      setType('text')
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-fields', workspaceId, projectId] }),
  })

  const fields = fieldsQuery.data ?? []

  return (
    <section>
      <WorkSectionTitle
        action={
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            {showForm ? t('common.cancel') : t('projectShell.addField')}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.customFields')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.customFieldsDesc')}
      </p>

      {showForm && (
        <WorkCreateCard onCancel={() => setShowForm(false)}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projectShell.fieldNamePlaceholder')}
            className="h-9"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldDef['type'])}
            className="h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm"
          >
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            {t('projectShell.required')}
          </label>
          {type === 'dropdown' && (
            <Input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={t('projectShell.optionsPlaceholder')}
              className="h-9"
            />
          )}
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? t('projectShell.creating') : t('projectShell.createField')}
          </Button>
        </WorkCreateCard>
      )}

      {fieldsQuery.isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80">{t('common.loading')}</Card>
      ) : fields.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.noFieldsBody')}
        </Card>
      ) : (
        <Card className="divide-y border-border/80 overflow-hidden">
          {fields.map((f) => {
            const typeOpt = FIELD_TYPE_OPTIONS.find((o) => o.value === f.type)
            return (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-background">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium flex items-center gap-2">
                  {f.name}
                  {f.isRequired && <span className="text-destructive text-[11px]">{t('projectShell.requiredTag')}</span>}
                </div>
                <div className="text-[12px] text-muted-foreground capitalize">
                  {typeOpt ? t(typeOpt.labelKey) : f.type}
                  {f.options && f.options.length > 0 && (
                    <> — {f.options.map((o) => o.label).join(', ')}</>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => remove.mutate(f.id)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}

type ProjectActivity = {
  id: string
  action: string
  createdAt: string
  taskId: string
  taskTitle?: string | null
  actor?: { id: string; displayName?: string | null; email?: string | null } | null
}

function activityIcon(action: string): string {
  if (action.includes('assigned')) return '👤'
  if (action.includes('comment')) return '💬'
  if (action.includes('status')) return '🔁'
  if (action.includes('attachment')) return '📎'
  if (action.includes('checklist')) return '☑️'
  if (action.includes('subtask')) return '🔗'
  if (action.includes('created')) return '✨'
  if (action.includes('deleted') || action.includes('archived')) return '🗑️'
  return '•'
}

function activityAsText(activity: ProjectActivity[], projectName?: string | null): string {
  const header = `Recent activity for project "${projectName ?? 'this project'}":`
  const lines = activity.slice(0, 30).map((a) => {
    const actor = a.actor?.displayName ?? a.actor?.email ?? 'Someone'
    const action = a.action.replace(/_/g, ' ')
    const on = a.taskTitle ? ` on "${a.taskTitle}"` : ''
    return `- ${actor} ${action}${on}`
  })
  return `${header}\n${lines.join('\n')}`
}

function ProjectActivitySection({
  projectId,
  workspaceId,
  projectName,
}: {
  projectId: string
  workspaceId: string
  projectName?: string | null
}) {
  const { t } = useTranslation()
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: () => api<ProjectActivity[]>(`/projects/${projectId}/activity?limit=40`),
  })
  const label = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // Draft a status update from recent project activity (Plan §7.9). Shown for
  // the user to copy / paste — the summarize AI turns the activity feed into prose.
  const [draft, setDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const draftUpdate = useMutation({
    mutationFn: () =>
      api<{ summary: string }>('/ai/summarize', {
        method: 'POST',
        body: { content: activityAsText(activity, projectName), type: 'project', workspaceId },
      }),
    onSuccess: (r) => {
      setDraft(r.summary)
      setCopied(false)
    },
    onError: () => toast.error(t('projectShell.draftUpdateError')),
  })

  return (
    <section>
      <WorkSectionTitle
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => draftUpdate.mutate()}
            disabled={draftUpdate.isPending || activity.length === 0}
            title={t('projectShell.draftUpdateTitle')}
          >
            {draftUpdate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t('projectShell.draftUpdate')}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.recentActivity')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.recentActivityDesc')}
      </p>

      {draft !== null && (
        <Card className="mb-4 border-accent/30 bg-accent/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {t('projectShell.draftUpdateHeading')}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(draft)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {copied ? t('projectShell.copied') : t('projectShell.copy')}
              </Button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-muted-foreground hover:text-foreground"
                title={t('common.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{draft}</p>
        </Card>
      )}
      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground border-border/80">{t('common.loading')}</Card>
      ) : activity.length === 0 ? (
        <Card className="p-4 text-[13px] text-muted-foreground border-dashed border-border/80">
          {t('projectShell.noActivityBody')}
        </Card>
      ) : (
        <Card className="border-border/80 overflow-hidden">
          <ol className="divide-y divide-border/60">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
                <span className="mt-0.5 shrink-0">{activityIcon(a.action)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="font-medium">{a.actor?.displayName ?? a.actor?.email ?? t('projectShell.system')}</span>{' '}
                    <span className="text-muted-foreground">{label(a.action)}</span>
                    {a.taskTitle ? (
                      <>
                        {' '}
                        <span className="text-muted-foreground">{t('projectShell.activityOn')}</span>{' '}
                        <span className="font-medium">{a.taskTitle}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  )
}

function ProjectTimeSettingsSection({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [newClientName, setNewClientName] = useState('')
  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ id: string; defaultBillable?: boolean; clientId?: string | null }>(`/projects/${projectId}`),
  })
  const clientsQuery = useQuery({
    queryKey: ['clients', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/workspaces/${workspaceId}/clients`),
  })
  const defaultBillable = projectQuery.data?.defaultBillable ?? false
  const clientId = projectQuery.data?.clientId ?? ''
  const clients = clientsQuery.data ?? []

  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { defaultBillable: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const setClient = useMutation({
    mutationFn: (nextClientId: string | null) =>
      api(`/projects/${projectId}`, { method: 'PUT', body: { clientId: nextClientId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
  })
  const createClient = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>(`/workspaces/${workspaceId}/clients`, { method: 'POST', body: { name } }),
    onSuccess: async (row) => {
      setNewClientName('')
      await qc.invalidateQueries({ queryKey: ['clients', workspaceId] })
      setClient.mutate(row.id)
    },
    onError: (err) => window.alert(err instanceof Error ? err.message : t('projectShell.createClientError')),
  })

  return (
    <section>
      <WorkSectionTitle>
        <span className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          {t('projectShell.timeTracking')}
        </span>
      </WorkSectionTitle>
      <p className="text-[13px] text-muted-foreground mb-4 -mt-1">
        {t('projectShell.timeTrackingDesc')}
      </p>
      <Card className="p-4 border-border/80">
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-[14px] font-medium">{t('projectShell.billableByDefault')}</div>
            <div className="text-[12px] text-muted-foreground">
              {t('projectShell.billableDesc')}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={defaultBillable}
            disabled={projectQuery.isLoading || toggle.isPending}
            onClick={() => toggle.mutate(!defaultBillable)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              defaultBillable ? 'bg-brand-700' : 'bg-muted',
              (projectQuery.isLoading || toggle.isPending) && 'opacity-60',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                defaultBillable && 'translate-x-5',
              )}
            />
          </button>
        </label>

        <div className="mt-4 pt-4 border-t border-border/60">
          <div className="text-[14px] font-medium">{t('projectShell.client')}</div>
          <div className="text-[12px] text-muted-foreground mb-2">
            {t('projectShell.clientDesc')}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={clientId}
              onChange={(e) => setClient.mutate(e.target.value || null)}
              disabled={setClient.isPending}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">{t('projectShell.noClient')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (newClientName.trim()) createClient.mutate(newClientName.trim())
            }}
          >
            <Input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder={t('projectShell.newClientPlaceholder')}
              className="h-8 flex-1"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newClientName.trim() || createClient.isPending}>
              {t('projectShell.add')}
            </Button>
          </form>
        </div>
      </Card>
    </section>
  )
}

function ListCard({
  list,
  workspaceId,
  spaceId,
  projectId,
}: {
  list: List
  workspaceId: string
  spaceId: string
  projectId: string
}) {
  const { data: tasks } = useQuery({
    queryKey: ['tasks', list.id],
    queryFn: () => api<Array<{ id: string; status: string }>>(`/tasks/list/${list.id}`),
  })

  const total = tasks?.length ?? 0
  const done = tasks?.filter((task) => task.status === 'done').length ?? 0

  return (
    <WorkEntityCard
      to="/app/$workspaceId/$spaceId/$projectId/$listId"
      params={{ workspaceId, spaceId, projectId, listId: list.id }}
      icon={<ListIcon className="h-5 w-5" />}
      title={list.name}
      subtitle={list.description}
      progress={{ done, total }}
    />
  )
}
