import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bot, Copy, Loader2, MessageSquare, Play, Plus, Share2, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input, Switch, Textarea, cn, toast } from '@rundesk/ui'
import { api, ApiError } from '../../lib/api'
import { useTranslation, type TranslationKey } from '../../lib/i18n'
import { useAuthStore } from '../../store/auth'

/**
 * SUPER AGENTS, AS CLICKUP'S AI HUB HAS THEM (`commit-log/log-214dac0-1`,
 * `ledger-rows/row-852`): the Agents half of the AI page's Ask | Agents switch.
 * All Agents, My Agents, recent ones, a new one from the builder or from
 * scratch, an agent's profile — Instructions, Triggers, Skills, Knowledge,
 * Memory; Message, Run agent, Share, switch off, Clone, Delete — and Activity.
 *
 * What is drawn is what the server answers: who may change an agent is its
 * `mayManage`, and a profile somebody may only use is shown without its saves.
 */

export type AgentSkill = 'search_tasks' | 'create_task' | 'set_task_status' | 'reschedule_task' | 'assign_task' | 'bulk_reschedule'
export const AGENT_SKILLS: AgentSkill[] = ['search_tasks', 'create_task', 'set_task_status', 'reschedule_task', 'assign_task', 'bulk_reschedule']
const SKILL_LABEL: Record<AgentSkill, TranslationKey> = {
  search_tasks: 'superAgents.skill.searchTasks',
  create_task: 'superAgents.skill.createTask',
  set_task_status: 'superAgents.skill.setTaskStatus',
  reschedule_task: 'superAgents.skill.rescheduleTask',
  assign_task: 'superAgents.skill.assignTask',
  bulk_reschedule: 'superAgents.skill.bulkReschedule',
}

type Trigger = { on: boolean; instructions?: string }
type Schedule = Trigger & { every: 'hourly' | 'daily' | 'weekly' | 'monthly'; at?: string; weekday?: number; day?: number }
export type AgentTriggers = { mention: Trigger; dm: Trigger; assign: Trigger; schedule: Schedule }
type Knowledge = { locations: Array<{ kind: 'space' | 'project' | 'list'; id: string }>; help: boolean }

export type AgentRow = {
  id: string
  userId: string
  name: string
  description: string
  avatarColor: string
  isPrivate: boolean
  isActive: boolean
  skills: string[]
  triggers: AgentTriggers
  createdById: string
  createdByName: string
  updatedAt: string
  lastRunAt: string | null
}
type Agent = AgentRow & {
  workspaceId: string
  instructions: string
  knowledge: Knowledge
  mayManage: boolean
  access: Array<{ userId: string; displayName: string; email: string }>
}
type Run = {
  id: string
  agentId: string
  agentName: string
  trigger: 'mention' | 'dm' | 'assign' | 'schedule' | 'automation' | 'manual'
  status: 'running' | 'completed' | 'failed' | 'skipped'
  triggeredByName: string | null
  location: { kind: string; id: string; title?: string } | null
  input: string
  output: string | null
  error: string | null
  startedAt: string
}
type Memory = { id: string; kind: 'recent' | 'preference' | 'intelligence'; content: string; approved: boolean; createdAt: string }
type Draft = { name: string; description: string; instructions: string; skills: string[]; triggers: AgentTriggers }

const DEFAULT_TRIGGERS: AgentTriggers = {
  mention: { on: true },
  dm: { on: true },
  assign: { on: true },
  schedule: { on: false, every: 'daily', at: '09:00' },
}
const EMPTY_DRAFT: Draft = { name: '', description: '', instructions: '', skills: ['search_tasks', 'create_task'], triggers: DEFAULT_TRIGGERS }

export type HubView = 'all' | 'mine' | 'activity'
const said = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : String(err))

/** The agents a reader may use, for every picker that lists them: the @ menu, the assignee picker, an Automation's action. */
export function useSuperAgents(workspaceId?: string | null, opts: { mine?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['super-agents', workspaceId ?? null, opts.mine ? 'mine' : 'all'],
    queryFn: () => api<AgentRow[]>(`/workspaces/${workspaceId}/super-agents${opts.mine ? '?mine=true' : ''}`),
    enabled: !!workspaceId && opts.enabled !== false,
    staleTime: 30_000,
    retry: false,
  })
}

export function AgentAvatar({ agent, size = 'md' }: { agent: Pick<AgentRow, 'name' | 'avatarColor'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white',
        size === 'sm' ? 'h-5 w-5 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-lg' : 'h-8 w-8 text-sm',
      )}
      style={{ background: agent.avatarColor }}
    >
      {agent.name.trim().charAt(0).toUpperCase() || <Bot className="h-3 w-3" />}
    </span>
  )
}

export function SuperAgentsHub({
  workspaceId,
  agentId,
  view,
  onOpen,
}: {
  workspaceId: string
  /** An agent's id, `new` for the builder, or nothing for a list. */
  agentId?: string
  view: HubView
  onOpen: (next: { agent?: string; view?: HubView }) => void
}) {
  const { t } = useTranslation()
  const all = useSuperAgents(workspaceId)
  const recent = useMemo(
    () =>
      (all.data ?? [])
        .filter((a) => a.lastRunAt)
        .sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? ''))
        .slice(0, 5),
    [all.data],
  )
  const refused = all.error ? said(all.error) : null

  return (
    <div className="flex h-full" data-testid="sa-hub">
      <nav className="w-56 shrink-0 border-r border-border/40 p-3 space-y-1 overflow-auto" aria-label={t('superAgents.title')}>
        <Button data-testid="sa-new" size="sm" className="w-full justify-start gap-1.5 mb-2" onClick={() => onOpen({ agent: 'new' })} disabled={!!refused}>
          <Plus className="h-3.5 w-3.5" />
          {t('superAgents.new')}
        </Button>
        {(
          [
            ['all', 'superAgents.allAgents'],
            ['mine', 'superAgents.myAgents'],
            ['activity', 'superAgents.activity'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`sa-nav-${key}`}
            aria-current={!agentId && view === key ? 'page' : undefined}
            onClick={() => onOpen({ view: key })}
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-sm',
              !agentId && view === key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            {t(label)}
          </button>
        ))}
        {recent.length > 0 && (
          <div className="pt-3">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('superAgents.recent')}</p>
            {recent.map((a) => (
              <button
                key={a.id}
                type="button"
                data-testid="sa-recent"
                data-agent-id={a.id}
                onClick={() => onOpen({ agent: a.id })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted/60"
              >
                <AgentAvatar agent={a} size="sm" />
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </nav>
      <div className="flex-1 overflow-auto p-5">
        {refused ? (
          <Card data-testid="sa-refused" className="p-4 text-sm text-muted-foreground">{refused}</Card>
        ) : agentId === 'new' ? (
          <NewAgent workspaceId={workspaceId} onMade={(id) => onOpen({ agent: id })} />
        ) : agentId ? (
          <AgentProfile workspaceId={workspaceId} agentId={agentId} onGone={() => onOpen({ view: 'all' })} onOpen={(id) => onOpen({ agent: id })} />
        ) : view === 'activity' ? (
          <Activity workspaceId={workspaceId} agents={all.data ?? []} />
        ) : (
          <AgentList workspaceId={workspaceId} mine={view === 'mine'} onOpen={(id) => onOpen({ agent: id })} />
        )}
      </div>
    </div>
  )
}

function AgentList({ workspaceId, mine, onOpen }: { workspaceId: string; mine: boolean; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const agents = useSuperAgents(workspaceId, { mine })
  if (agents.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  const rows = agents.data ?? []
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t(mine ? 'superAgents.myAgents' : 'superAgents.allAgents')}</h2>
      {rows.length === 0 ? (
        <p data-testid="sa-empty" className="text-sm text-muted-foreground">
          {t(mine ? 'superAgents.emptyMine' : 'superAgents.emptyAll')}
        </p>
      ) : (
        <div data-testid="sa-list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <button
              key={a.id}
              type="button"
              data-testid="sa-card"
              data-agent-id={a.id}
              onClick={() => onOpen(a.id)}
              className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left hover:border-accent/60"
            >
              <AgentAvatar agent={a} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span data-testid="sa-card-name" className="truncate font-medium">{a.name}</span>
                  {a.isPrivate && <Badge data-testid="sa-card-private" variant="outline">{t('superAgents.private')}</Badge>}
                  {!a.isActive && <Badge data-testid="sa-card-inactive" variant="secondary">{t('superAgents.inactive')}</Badge>}
                </span>
                {a.description && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{a.description}</span>}
                <span className="mt-1 block text-[11px] text-muted-foreground">{t('superAgents.madeBy', { name: a.createdByName })}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** ClickUp's two ways in: describe it to the builder, or start from scratch. Either way the form is what is made. */
function NewAgent({ workspaceId, onMade }: { workspaceId: string; onMade: (id: string) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [describe, setDescribe] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const build = useMutation({
    mutationFn: () => api<Draft>(`/workspaces/${workspaceId}/super-agents/build`, { method: 'POST', body: { description: describe } }),
    onSuccess: (d) => setDraft({ ...EMPTY_DRAFT, ...d }),
  })
  const create = useMutation({
    mutationFn: (d: Draft) => api<Agent>(`/workspaces/${workspaceId}/super-agents`, { method: 'POST', body: d }),
    onSuccess: async (agent) => {
      await qc.invalidateQueries({ queryKey: ['super-agents', workspaceId] })
      onMade(agent.id)
    },
  })
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">{t('superAgents.new')}</h2>
      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">{t('superAgents.builderTitle')}</p>
        <Textarea
          data-testid="sa-builder-input"
          value={describe}
          onChange={(e) => setDescribe(e.target.value)}
          placeholder={t('superAgents.builderPlaceholder')}
          rows={3}
        />
        <div className="flex items-center gap-2">
          <Button data-testid="sa-builder-submit" size="sm" onClick={() => build.mutate()} disabled={!describe.trim() || build.isPending}>
            {build.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('superAgents.builderSubmit')}
          </Button>
          <Button data-testid="sa-from-scratch" size="sm" variant="ghost" onClick={() => setDraft(EMPTY_DRAFT)}>
            {t('superAgents.fromScratch')}
          </Button>
        </div>
        {build.error && <p data-testid="sa-builder-error" className="text-xs text-destructive">{said(build.error)}</p>}
      </Card>
      {draft && (
        <Card data-testid="sa-form" className="p-4 space-y-4">
          <ProfileFields draft={draft} onChange={setDraft} editable />
          {create.error && <p data-testid="sa-form-error" className="text-xs text-destructive">{said(create.error)}</p>}
          <Button data-testid="sa-form-create" onClick={() => create.mutate(draft)} disabled={!draft.name.trim() || create.isPending}>
            {t('superAgents.create')}
          </Button>
        </Card>
      )}
    </div>
  )
}

/** Name, description, Instructions, Triggers and Skills — the new-agent form and the profile draw the same fields. */
function ProfileFields({ draft, onChange, editable }: { draft: Draft; onChange: (d: Draft) => void; editable: boolean }) {
  const { t } = useTranslation()
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const setTrigger = (key: keyof AgentTriggers, patch: Partial<Schedule>) =>
    set({ triggers: { ...draft.triggers, [key]: { ...draft.triggers[key], ...patch } } })
  return (
    <>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t('superAgents.name')}</span>
        <Input data-testid="sa-form-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} disabled={!editable} maxLength={60} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t('superAgents.description')}</span>
        <Input data-testid="sa-form-description" value={draft.description} onChange={(e) => set({ description: e.target.value })} disabled={!editable} maxLength={500} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{t('superAgents.instructions')}</span>
        <Textarea data-testid="sa-form-instructions" value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} disabled={!editable} rows={5} />
      </label>
      <fieldset className="space-y-2" data-testid="sa-triggers">
        <legend className="text-xs font-medium text-muted-foreground">{t('superAgents.triggers')}</legend>
        {(
          [
            ['mention', 'superAgents.trigger.mention'],
            ['dm', 'superAgents.trigger.dm'],
            ['assign', 'superAgents.trigger.assign'],
            ['schedule', 'superAgents.trigger.schedule'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
            <Switch
              data-testid={`sa-trigger-${key}`}
              checked={draft.triggers[key].on}
              onCheckedChange={(on: boolean) => setTrigger(key, { on })}
              disabled={!editable}
              aria-label={t(label)}
            />
            <span>{t(label)}</span>
            {key === 'schedule' && draft.triggers.schedule.on && (
              <>
                <select
                  data-testid="sa-schedule-every"
                  value={draft.triggers.schedule.every}
                  onChange={(e) => setTrigger('schedule', { every: e.target.value as Schedule['every'] })}
                  disabled={!editable}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {(['hourly', 'daily', 'weekly', 'monthly'] as const).map((every) => (
                    <option key={every} value={every}>{t(`superAgents.every.${every}`)}</option>
                  ))}
                </select>
                <Input
                  data-testid="sa-schedule-at"
                  type="time"
                  value={draft.triggers.schedule.at ?? '09:00'}
                  onChange={(e) => setTrigger('schedule', { at: e.target.value })}
                  disabled={!editable}
                  className="h-8 w-28"
                />
              </>
            )}
          </div>
        ))}
      </fieldset>
      <fieldset className="space-y-1.5" data-testid="sa-skills">
        <legend className="text-xs font-medium text-muted-foreground">{t('superAgents.skills')}</legend>
        {AGENT_SKILLS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid={`sa-skill-${key}`}
              checked={draft.skills.includes(key)}
              disabled={!editable}
              onChange={(e) => set({ skills: e.target.checked ? [...draft.skills, key] : draft.skills.filter((k) => k !== key) })}
            />
            {t(SKILL_LABEL[key])}
          </label>
        ))}
      </fieldset>
    </>
  )
}

function AgentProfile({ workspaceId, agentId, onGone, onOpen }: { workspaceId: string; agentId: string; onGone: () => void; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const agentQuery = useQuery({ queryKey: ['super-agent', agentId], queryFn: () => api<Agent>(`/super-agents/${agentId}`), retry: false })
  const agent = agentQuery.data
  const [draft, setDraft] = useState<Draft | null>(null)
  const [knowledge, setKnowledge] = useState<Knowledge>({ locations: [], help: false })
  const [prompt, setPrompt] = useState('')
  const [lastRun, setLastRun] = useState<Run | null>(null)
  const [sharing, setSharing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    if (!agent) return
    setDraft({ name: agent.name, description: agent.description, instructions: agent.instructions, skills: agent.skills, triggers: agent.triggers })
    setKnowledge(agent.knowledge ?? { locations: [], help: false })
  }, [agent])
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['super-agent', agentId] })
    await qc.invalidateQueries({ queryKey: ['super-agents', workspaceId] })
  }
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Agent>(`/super-agents/${agentId}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await refresh()
      toast.success(t('superAgents.saved'))
    },
    onError: (err) => toast.error(said(err)),
  })
  const run = useMutation({
    mutationFn: () => api<Run>(`/super-agents/${agentId}/run`, { method: 'POST', body: { prompt } }),
    onSuccess: async (r) => {
      setLastRun(r)
      await qc.invalidateQueries({ queryKey: ['super-agent-memories', agentId] })
      await qc.invalidateQueries({ queryKey: ['super-agent-activity', workspaceId] })
    },
    onError: (err) => toast.error(said(err)),
  })
  const message = useMutation({
    mutationFn: () => api<{ id: string }>(`/workspaces/${workspaceId}/chat/dms`, { method: 'POST', body: { peerUserId: agent?.userId } }),
    onSuccess: async (channel) => {
      // Read the channel list again first: Chat falls back to #general for a DM it does not hold yet.
      await qc.invalidateQueries({ queryKey: ['chat-channels', workspaceId] })
      navigate({ to: '/app/$workspaceId/chat', params: { workspaceId }, search: { channel: channel.id } as never })
    },
    onError: (err) => toast.error(said(err)),
  })
  const clone = useMutation({
    mutationFn: () => api<Agent>(`/super-agents/${agentId}/clone`, { method: 'POST' }),
    onSuccess: async (copy) => {
      await refresh()
      onOpen(copy.id)
    },
    onError: (err) => toast.error(said(err)),
  })
  const remove = useMutation({
    mutationFn: () => api(`/super-agents/${agentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['super-agents', workspaceId] })
      onGone()
    },
    onError: (err) => toast.error(said(err)),
  })

  if (agentQuery.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  if (agentQuery.error || !agent || !draft) {
    return <Card data-testid="sa-profile-missing" className="p-4 text-sm text-muted-foreground">{agentQuery.error ? said(agentQuery.error) : t('superAgents.notFound')}</Card>
  }
  const may = agent.mayManage
  return (
    <div data-testid="sa-profile" data-agent-id={agent.id} data-may-manage={may ? 'true' : 'false'} className="max-w-3xl space-y-4">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 data-testid="sa-profile-name" className="text-xl font-semibold">{agent.name}</h2>
          {agent.description && <p data-testid="sa-profile-description" className="text-sm text-muted-foreground">{agent.description}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {agent.isPrivate && <Badge variant="outline">{t('superAgents.private')}</Badge>}
            <Badge data-testid="sa-profile-state" data-active={agent.isActive ? 'true' : 'false'} variant={agent.isActive ? 'default' : 'secondary'}>
              {t(agent.isActive ? 'superAgents.active' : 'superAgents.inactive')}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button data-testid="sa-message" size="sm" variant="outline" onClick={() => message.mutate()} disabled={message.isPending || !agent.isActive}>
            <MessageSquare className="mr-1 h-3.5 w-3.5" />
            {t('superAgents.message')}
          </Button>
          {may && (
            <>
              <Button data-testid="sa-share" size="sm" variant="outline" onClick={() => setSharing((v) => !v)}>
                <Share2 className="mr-1 h-3.5 w-3.5" />
                {t('superAgents.share')}
              </Button>
              <Button data-testid="sa-toggle-active" size="sm" variant="outline" onClick={() => save.mutate({ isActive: !agent.isActive })}>
                {t(agent.isActive ? 'superAgents.deactivate' : 'superAgents.activate')}
              </Button>
            </>
          )}
          <Button data-testid="sa-clone" size="sm" variant="ghost" onClick={() => clone.mutate()} disabled={clone.isPending}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            {t('superAgents.clone')}
          </Button>
          {may && (
            <Button data-testid="sa-delete" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('superAgents.delete')}
            </Button>
          )}
        </div>
      </div>
      {confirmDelete && (
        <Card data-testid="sa-delete-dialog" className="flex items-center justify-between gap-2 border-destructive/40 p-3 text-sm">
          <span>{t('superAgents.deleteConfirm', { name: agent.name })}</span>
          <span className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button data-testid="sa-delete-confirm" size="sm" variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {t('superAgents.delete')}
            </Button>
          </span>
        </Card>
      )}
      {sharing && may && <ShareAgent workspaceId={workspaceId} agent={agent} onDone={() => setSharing(false)} onSaved={refresh} />}

      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">{t('superAgents.runTitle')}</p>
        <div className="flex gap-2">
          <Input data-testid="sa-run-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('superAgents.runPlaceholder')} />
          <Button data-testid="sa-run-submit" size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            <span className="ml-1">{t('superAgents.run')}</span>
          </Button>
        </div>
        {lastRun && (
          <div data-testid="sa-run-output" data-status={lastRun.status} className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
            {lastRun.status === 'completed' ? lastRun.output : `${t(`superAgents.status.${lastRun.status}`)}: ${lastRun.error ?? ''}`}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <ProfileFields draft={draft} onChange={setDraft} editable={may} />
        {may && (
          <Button
            data-testid="sa-profile-save"
            size="sm"
            onClick={() => save.mutate({ ...draft })}
            disabled={save.isPending || !draft.name.trim()}
          >
            {t('superAgents.save')}
          </Button>
        )}
      </Card>

      <KnowledgeCard workspaceId={workspaceId} knowledge={knowledge} onChange={setKnowledge} editable={may} onSave={() => save.mutate({ knowledge })} />
      <MemoryCard agentId={agent.id} editable={may} />
    </div>
  )
}

function ShareAgent({ workspaceId, agent, onDone, onSaved }: { workspaceId: string; agent: Agent; onDone: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user)
  const members = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<Array<{ userId: string; displayName: string; email: string; role: string }>>(`/workspaces/${workspaceId}/members`),
  })
  const [isPrivate, setPrivate] = useState(agent.isPrivate)
  const [chosen, setChosen] = useState<Set<string>>(new Set(agent.access.map((a) => a.userId)))
  const save = useMutation({
    mutationFn: () => api<Agent>(`/super-agents/${agent.id}/access`, { method: 'PUT', body: { isPrivate, userIds: [...chosen] } }),
    onSuccess: async () => {
      await onSaved()
      onDone()
    },
    onError: (err) => toast.error(said(err)),
  })
  const people = (members.data ?? []).filter((m) => m.role !== 'guest' && m.userId !== agent.createdById && m.userId !== me?.id)
  return (
    <Card data-testid="sa-share-dialog" className="p-4 space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Switch data-testid="sa-share-private" checked={isPrivate} onCheckedChange={(v: boolean) => setPrivate(v)} />
        {t('superAgents.makePrivate')}
      </label>
      <p className="text-xs text-muted-foreground">{t(isPrivate ? 'superAgents.privateHint' : 'superAgents.publicHint')}</p>
      {isPrivate && (
        <div className="max-h-48 space-y-1 overflow-auto">
          {people.map((m) => (
            <label key={m.userId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="sa-share-member"
                data-user-id={m.userId}
                checked={chosen.has(m.userId)}
                onChange={(e) => {
                  const next = new Set(chosen)
                  if (e.target.checked) next.add(m.userId)
                  else next.delete(m.userId)
                  setChosen(next)
                }}
              />
              {m.displayName}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Button data-testid="sa-share-save" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{t('superAgents.save')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </Card>
  )
}

/** Where it may read: the spaces it is given, or everything its reader may read; and Rundesk's help. */
function KnowledgeCard({
  workspaceId,
  knowledge,
  onChange,
  editable,
  onSave,
}: {
  workspaceId: string
  knowledge: Knowledge
  onChange: (k: Knowledge) => void
  editable: boolean
  onSave: () => void
}) {
  const { t } = useTranslation()
  const spaces = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/spaces/workspace/${workspaceId}`),
  })
  const chosen = new Set(knowledge.locations.filter((l) => l.kind === 'space').map((l) => l.id))
  return (
    <Card data-testid="sa-knowledge" className="p-4 space-y-2">
      <p className="text-sm font-medium">{t('superAgents.knowledge')}</p>
      <p className="text-xs text-muted-foreground">{t(chosen.size ? 'superAgents.knowledgeScoped' : 'superAgents.knowledgeAll')}</p>
      {(spaces.data ?? []).map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="sa-knowledge-space"
            data-space-id={s.id}
            checked={chosen.has(s.id)}
            disabled={!editable}
            onChange={(e) =>
              onChange({
                ...knowledge,
                locations: e.target.checked
                  ? [...knowledge.locations, { kind: 'space', id: s.id }]
                  : knowledge.locations.filter((l) => !(l.kind === 'space' && l.id === s.id)),
              })
            }
          />
          {s.name}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" data-testid="sa-knowledge-help" checked={knowledge.help} disabled={!editable} onChange={(e) => onChange({ ...knowledge, help: e.target.checked })} />
        {t('superAgents.knowledgeHelp')}
      </label>
      {editable && (
        <Button data-testid="sa-knowledge-save" size="sm" variant="outline" onClick={onSave}>
          {t('superAgents.save')}
        </Button>
      )}
    </Card>
  )
}

function MemoryCard({ agentId, editable }: { agentId: string; editable: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const memories = useQuery({ queryKey: ['super-agent-memories', agentId], queryFn: () => api<Memory[]>(`/super-agents/${agentId}/memories`) })
  const act = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approve
        ? api(`/super-agents/${agentId}/memories/${id}/approve`, { method: 'POST' })
        : api(`/super-agents/${agentId}/memories/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-agent-memories', agentId] }),
    onError: (err) => toast.error(said(err)),
  })
  const rows = memories.data ?? []
  return (
    <Card data-testid="sa-memory-card" className="p-4 space-y-2">
      <p className="text-sm font-medium">{t('superAgents.memory')}</p>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">{t('superAgents.memoryEmpty')}</p>}
      {rows.map((m) => (
        <div key={m.id} data-testid="sa-memory" data-kind={m.kind} data-approved={m.approved ? 'true' : 'false'} className="flex items-start gap-2 text-sm">
          <Badge variant="outline">{t(`superAgents.memoryKind.${m.kind}`)}</Badge>
          <span className="flex-1">{m.content}</span>
          {editable && !m.approved && (
            <Button data-testid="sa-memory-approve" size="sm" variant="outline" onClick={() => act.mutate({ id: m.id, approve: true })}>
              {t('superAgents.approve')}
            </Button>
          )}
          {editable && (
            <Button data-testid="sa-memory-forget" size="sm" variant="ghost" onClick={() => act.mutate({ id: m.id, approve: false })}>
              {t('superAgents.forget')}
            </Button>
          )}
        </div>
      ))}
    </Card>
  )
}

/** ClickUp's Activity: every run, newest first, filtered by status, "My agents" and agent. */
function Activity({ workspaceId, agents }: { workspaceId: string; agents: AgentRow[] }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState(false)
  const [agentId, setAgentId] = useState('')
  const query = new URLSearchParams()
  if (status) query.set('status', status)
  if (mine) query.set('mine', 'true')
  if (agentId) query.set('agentId', agentId)
  const runs = useQuery({
    queryKey: ['super-agent-activity', workspaceId, status, mine, agentId],
    queryFn: () => api<Run[]>(`/workspaces/${workspaceId}/super-agents/activity?${query.toString()}`),
  })
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t('superAgents.activity')}</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select data-testid="sa-activity-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
          <option value="">{t('superAgents.anyStatus')}</option>
          {(['completed', 'failed', 'skipped'] as const).map((s) => (
            <option key={s} value={s}>{t(`superAgents.status.${s}`)}</option>
          ))}
        </select>
        <select data-testid="sa-activity-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
          <option value="">{t('superAgents.anyAgent')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" data-testid="sa-activity-mine" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t('superAgents.myAgents')}
        </label>
      </div>
      {(runs.data ?? []).length === 0 && !runs.isLoading ? (
        <p data-testid="sa-activity-empty" className="text-sm text-muted-foreground">{t('superAgents.activityEmpty')}</p>
      ) : (
        <table data-testid="sa-activity" className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">{t('superAgents.col.time')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('superAgents.col.agent')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('superAgents.col.trigger')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('superAgents.col.by')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('superAgents.col.where')}</th>
              <th className="py-1.5 font-medium">{t('superAgents.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(runs.data ?? []).map((r) => (
              <tr key={r.id} data-testid="sa-activity-row" data-status={r.status} data-trigger={r.trigger} data-agent-id={r.agentId} className="border-t border-border/40 align-top">
                <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="py-1.5 pr-3">{r.agentName}</td>
                <td className="py-1.5 pr-3">{t(`superAgents.trigger.${r.trigger}`)}</td>
                <td className="py-1.5 pr-3">{r.triggeredByName ?? '—'}</td>
                <td className="py-1.5 pr-3">{r.location?.title ?? (r.location ? t(`superAgents.where.${r.location.kind}` as TranslationKey) : '—')}</td>
                <td className="py-1.5">
                  <span data-testid="sa-activity-status-cell">{t(`superAgents.status.${r.status}`)}</span>
                  {r.error && <span className="block text-xs text-muted-foreground">{r.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
