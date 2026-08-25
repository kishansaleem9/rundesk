import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Textarea, Label, Badge, Switch, Separator, cn, toast } from '@rundesk/ui'
import {
  ArrowLeft,
  Brain,
  Gem,
  Loader2,
  Plug,
  Plus,
  Trash2,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { api } from '../lib/api'
import { PanelSkeleton } from '../components/loading-skeletons'
import { useAuthStore } from '../store/auth'
import {
  useAddSkillConnection,
  useAddSkillMemory,
  useDeleteSkill,
  useRemoveSkillConnection,
  useRemoveSkillMemory,
  useSkill,
  useSkillConnections,
  useSkillMemories,
  useUpdateSkill,
} from '../lib/skills-api'

/**
 * §15 — one skill, and the two things she named alongside it.
 *
 * Three sections in the order she says them: the playbook itself [17:38], its
 * MEMORY [18:42], and its CONNECTIONS [18:58]. A non-owner sees all three but
 * can change none of them — sharing a skill shares its use, not its authorship.
 */
export function SkillDetailPage() {
  const { workspaceId, skillId } = useParams({ strict: false }) as {
    workspaceId: string
    skillId: string
  }
  const { t } = useTranslation()
  const navigate = useNavigate()
  const me = useAuthStore((s) => s.user?.id)

  const skillQuery = useSkill(workspaceId, skillId)
  const skill = skillQuery.data
  const mine = !!skill && skill.createdById === me

  const update = useUpdateSkill(workspaceId, skillId)
  const remove = useDeleteSkill(workspaceId)

  const [draft, setDraft] = useState({ name: '', description: '', instructions: '' })
  const [loaded, setLoaded] = useState(false)

  // Seed the form once. Re-seeding on every query settle would wipe whatever
  // the person is mid-way through typing the moment a refetch lands.
  useEffect(() => {
    if (!skill || loaded) return
    setDraft({
      name: skill.name,
      description: skill.description ?? '',
      instructions: skill.instructions,
    })
    setLoaded(true)
  }, [skill, loaded])

  if (skillQuery.isLoading) return <PanelSkeleton className="m-6" />
  if (skillQuery.isError || !skill) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{t('skills.loadFailed')}</p>
      </div>
    )
  }

  const dirty =
    draft.name !== skill.name ||
    draft.description !== (skill.description ?? '') ||
    draft.instructions !== skill.instructions

  const save = () => {
    if (!draft.name.trim()) return
    update.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        instructions: draft.instructions,
      } as never,
      {
        onSuccess: () => toast.success(t('skills.saved')),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
      },
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6" data-testid="skill-detail">
      <button
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        onClick={() =>
          navigate({ to: '/app/$workspaceId/skills' as never, params: { workspaceId } as never })
        }
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('skills.back')}
      </button>

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Gem className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-xl font-semibold truncate">{skill.name}</h1>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {skill.visibility === 'workspace' ? t('skills.shared') : t('skills.private')}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          data-testid="skill-ask"
          onClick={() =>
            navigate({
              to: '/app/$workspaceId/ai' as never,
              params: { workspaceId } as never,
              search: { skillId: skill.id } as never,
            })
          }
        >
          <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
          {t('skills.useInChat')}
        </Button>
      </header>

      {!mine && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t('skills.ownerOnly')}
        </div>
      )}

      {/* ─── The playbook ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="skill-name">{t('skills.nameLabel')}</Label>
          <Input
            id="skill-name"
            data-testid="skill-name"
            value={draft.name}
            disabled={!mine}
            placeholder={t('skills.namePlaceholder')}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skill-description">{t('skills.descriptionLabel')}</Label>
          <Input
            id="skill-description"
            data-testid="skill-description"
            value={draft.description}
            disabled={!mine}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skill-instructions">{t('skills.instructionsLabel')}</Label>
          <Textarea
            id="skill-instructions"
            data-testid="skill-instructions"
            rows={10}
            value={draft.instructions}
            disabled={!mine}
            onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
            className="font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">{t('skills.instructionsHint')}</p>
        </div>

        {mine && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              data-testid="skill-save"
              onClick={save}
              disabled={!dirty || !draft.name.trim() || update.isPending}
            >
              {update.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {t('skills.save')}
            </Button>
          </div>
        )}
      </section>

      {mine && (
        <>
          <Separator />
          <section className="space-y-3">
            <ToggleRow
              testid="skill-enabled"
              checked={skill.enabled}
              onChange={(v) => update.mutate({ enabled: v } as never)}
              label={t('skills.enabledLabel')}
              hint={t('skills.enabledHint')}
            />
            <ToggleRow
              testid="skill-visibility"
              checked={skill.visibility === 'workspace'}
              onChange={(v) => update.mutate({ visibility: v ? 'workspace' : 'private' } as never)}
              label={t('skills.visibilityLabel')}
              hint={t('skills.visibilityHint')}
            />
          </section>
        </>
      )}

      <Separator />
      <SkillMemorySection workspaceId={workspaceId} skillId={skillId} canEdit={mine} />

      <Separator />
      <SkillConnectionsSection workspaceId={workspaceId} skillId={skillId} canEdit={mine} />

      <Separator />
      <p className="text-xs text-muted-foreground">{t('skills.boundary')}</p>

      {mine && (
        <div className="pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            data-testid="skill-delete"
            onClick={() => {
              if (!window.confirm(t('skills.deleteConfirm', { name: skill.name }))) return
              remove.mutate(skillId, {
                onSuccess: () => {
                  toast.success(t('skills.deleted'))
                  navigate({
                    to: '/app/$workspaceId/skills' as never,
                    params: { workspaceId } as never,
                  })
                },
              })
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t('skills.delete')}
          </Button>
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  testid,
  checked,
  onChange,
  label,
  hint,
}: {
  testid: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch data-testid={testid} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/**
 * §15 memory — [18:42] "yeh hum jo bhi baat karenge woh STORE karega apne
 * andar." Append-only on purpose: memory is a record of what the skill has been
 * told, and editing a record in place loses the fact that it changed.
 */
function SkillMemorySection({
  workspaceId,
  skillId,
  canEdit,
}: {
  workspaceId: string
  skillId: string
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const { data: memories = [], isLoading } = useSkillMemories(workspaceId, skillId)
  const add = useAddSkillMemory(workspaceId, skillId)
  const forget = useRemoveSkillMemory(workspaceId, skillId)
  const [text, setText] = useState('')

  const submit = () => {
    const content = text.trim()
    if (!content) return
    add.mutate(content, {
      onSuccess: () => setText(''),
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
    })
  }

  return (
    <section className="space-y-3" data-testid="skill-memory">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t('skills.memory')}</h2>
        <Badge variant="secondary" className="text-[10px]">
          {memories.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t('skills.memoryHint')}</p>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            data-testid="skill-memory-input"
            value={text}
            placeholder={t('skills.memoryPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <Button
            size="sm"
            data-testid="skill-memory-add"
            onClick={submit}
            disabled={!text.trim() || add.isPending}
          >
            {add.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">{t('skills.memoryAdd')}</span>
          </Button>
        </div>
      )}

      {isLoading ? (
        <PanelSkeleton />
      ) : memories.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="skill-memory-empty">
          {t('skills.memoryEmpty')}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="skill-memory-list">
          {memories.map((memory) => (
            <li
              key={memory.id}
              data-testid={`skill-memory-${memory.id}`}
              className="group flex items-start justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 break-words">{memory.content}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {memory.source === 'chat' && (
                  <Badge variant="outline" className="text-[10px]">
                    {t('skills.useInChat')}
                  </Badge>
                )}
                {canEdit && (
                  <button
                    title={t('skills.memoryForget')}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={() => forget.mutate(memory.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * §15 connections — [18:58] "main is ko kisi bhi system mein CONNECT kar sakti
 * hoon."
 *
 * The picker offers the providers the backend supports, and each binding says
 * whether the workspace has actually granted it. A binding without a grant is
 * the honest state — "waiting on an admin" — rather than a row that silently
 * does nothing.
 */
function SkillConnectionsSection({
  workspaceId,
  skillId,
  canEdit,
}: {
  workspaceId: string
  skillId: string
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const { data: bindings = [], isLoading } = useSkillConnections(workspaceId, skillId)
  const add = useAddSkillConnection(workspaceId, skillId)
  const remove = useRemoveSkillConnection(workspaceId, skillId)
  const [provider, setProvider] = useState('')

  const { data: providers = [] } = useQuery({
    queryKey: ['integration-providers', workspaceId],
    queryFn: () =>
      api<string[]>(`/workspaces/${workspaceId}/integrations/connections/providers`),
    staleTime: Infinity,
  })
  const { data: workspaceConnections = [] } = useQuery({
    queryKey: ['integration-connections', workspaceId],
    queryFn: () =>
      api<Array<{ id: string; provider: string }>>(
        `/workspaces/${workspaceId}/integrations/connections`,
      ),
  })

  const bound = new Set(bindings.map((b) => b.provider))
  const available = providers.filter((p) => !bound.has(p))

  const connect = () => {
    if (!provider) return
    // Attach the workspace's grant when there is one; otherwise bind the
    // provider name alone and let the row read "waiting on an admin".
    const existing = workspaceConnections.find((c) => c.provider === provider)
    add.mutate(
      { provider, connectionId: existing?.id },
      {
        onSuccess: () => setProvider(''),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
      },
    )
  }

  return (
    <section className="space-y-3" data-testid="skill-connections">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t('skills.connections')}</h2>
        <Badge variant="secondary" className="text-[10px]">
          {bindings.length}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t('skills.connectionsHint')}</p>

      {canEdit && available.length > 0 && (
        <div className="flex gap-2">
          <select
            data-testid="skill-connection-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm flex-1"
          >
            <option value="">{t('skills.connectionsPlaceholder')}</option>
            {available.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            data-testid="skill-connection-add"
            onClick={connect}
            disabled={!provider || add.isPending}
          >
            {add.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5">{t('skills.connectionsAdd')}</span>
          </Button>
        </div>
      )}

      {isLoading ? (
        <PanelSkeleton />
      ) : bindings.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="skill-connections-empty">
          {t('skills.connectionsEmpty')}
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="skill-connections-list">
          {bindings.map((binding) => (
            <li
              key={binding.id}
              data-testid={`skill-connection-${binding.provider}`}
              className="group flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{binding.provider}</span>
                <span
                  className={cn(
                    'ml-2 text-xs',
                    binding.connectionId ? 'text-muted-foreground' : 'text-amber-600',
                  )}
                >
                  {binding.connectionId
                    ? binding.account ?? binding.status ?? ''
                    : t('skills.connectionsWaiting')}
                </span>
              </div>
              {canEdit && (
                <button
                  title={t('skills.connectionsRemove')}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                  onClick={() => remove.mutate(binding.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
