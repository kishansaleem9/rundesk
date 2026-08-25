import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Badge, cn, toast } from '@rundesk/ui'
import { Check, Download, Gem, Loader2, Quote, Search, Users, X } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { PanelSkeleton } from './loading-skeletons'
import {
  mineSkills,
  useCreateSkillFromProposal,
  useDiscoverableSkills,
  useSetSkillInstalled,
  type MinedSkill,
  type ProposalStep,
} from '../lib/skills-api'

/**
 * §15 — the two functional starter cards, frame `285_1743`.
 *
 *   "Skills Miner / Turn repeat work into skills / Scan your tasks, docs, and
 *    chats to surface workflows worth saving" → **Find my Skills**
 *
 *   "For your team / Discover team skills / Discover skills created across
 *    your workspace" → **Scan my workspace**
 *
 * They shared a panel because they answer the same question from two
 * directions — what should I have a skill for? — and because a person who
 * finds nothing in their own work should see what their colleagues already
 * built without going anywhere.
 */
export function SkillDiscoveryPanel({
  workspaceId,
  mode,
  onClose,
  className,
}: {
  workspaceId: string
  mode: 'mine' | 'team'
  onClose: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn('flex flex-col border-l border-border/60 bg-card', className)}
      data-testid={`skill-discovery-${mode}`}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          {mode === 'mine' ? (
            <Search className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <Users className="h-4 w-4 text-primary shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {mode === 'mine' ? t('skills.miner.title') : t('skills.discover.title')}
          </span>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title={t('common.close')}
          data-testid="skill-discovery-close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {mode === 'mine' ? (
          <MinerBody workspaceId={workspaceId} />
        ) : (
          <TeamBody workspaceId={workspaceId} />
        )}
      </div>
    </div>
  )
}

function MinerBody({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateSkillFromProposal(workspaceId)

  const [steps, setSteps] = useState<ProposalStep[]>([])
  const [found, setFound] = useState<MinedSkill[] | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [created, setCreated] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const scan = async () => {
    if (scanning) return
    setSteps([])
    setFound(null)
    setError('')
    setMessage('')
    setScanning(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await mineSkills(workspaceId, {
        onStep: (step) => setSteps((prev) => [...prev, step]),
        signal: controller.signal,
      })
      setFound(result.skills)
      setMessage(result.message)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : t('skills.loadFailed'))
    } finally {
      setScanning(false)
      abortRef.current = null
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('skills.miner.body')}</p>

      <Button onClick={scan} disabled={scanning} data-testid="skill-miner-run" className="w-full">
        {scanning ? (
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
        ) : (
          <Search className="h-4 w-4 mr-1.5" />
        )}
        {t('skills.miner.run')}
      </Button>

      {/* What it read, arriving before what it concluded. */}
      {steps.length > 0 && (
        <div className="space-y-1" data-testid="skill-miner-steps">
          {steps.map((step, i) => (
            <div
              key={`${step.label}-${i}`}
              className="flex items-start gap-2 text-xs text-muted-foreground"
            >
              <Check className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
              <span>
                {step.label}
                {step.finding && <span className="opacity-70"> — {step.finding}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm">{message}</p>}

      {found?.map((skill) => {
        const madeId = created[skill.name]
        return (
          <div
            key={skill.name}
            className="rounded-xl border border-border/70 p-3 space-y-2"
            data-testid="skill-miner-result"
          >
            <div className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium">{skill.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">{skill.rationale}</p>

            {/* The evidence, verbatim. The card claims it read your work; these
                are the lines that let you check that rather than take it. */}
            <ul className="space-y-0.5" data-testid="skill-miner-evidence">
              {skill.evidence.map((line) => (
                <li key={line} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Quote className="h-2.5 w-2.5 mt-1 shrink-0 opacity-50" />
                  <span className="truncate">{line}</span>
                </li>
              ))}
            </ul>

            {madeId ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  {t('skills.author.created')}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: '/app/$workspaceId/skills/$skillId' as never,
                      params: { workspaceId, skillId: madeId } as never,
                    })
                  }
                >
                  {t('skills.author.open')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                data-testid="skill-miner-approve"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    {
                      name: skill.name,
                      description: skill.description,
                      instructions: skill.instructions,
                      memories: skill.memories,
                    },
                    {
                      onSuccess: (made) => {
                        toast.success(t('skills.created', { name: made.name }))
                        setCreated((prev) => ({ ...prev, [skill.name]: made.id }))
                      },
                      onError: (err: unknown) =>
                        toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
                    },
                  )
                }
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                {t('skills.author.approve')}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TeamBody({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const { data: skills, isLoading, isError } = useDiscoverableSkills(workspaceId)
  const setInstalled = useSetSkillInstalled(workspaceId)

  if (isLoading) return <PanelSkeleton />
  if (isError) return <p className="text-sm text-destructive">{t('skills.loadFailed')}</p>

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('skills.discover.body')}</p>
      {(skills ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="skill-discover-empty">
          {t('skills.discover.empty')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="skill-discover-list">
          {(skills ?? []).map((skill) => (
            <li
              key={skill.id}
              className="rounded-xl border border-border/70 p-3 space-y-2"
              data-testid={`skill-discover-${skill.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Gem className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium truncate">{skill.name}</span>
                  </div>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </div>
                {skill.installs > 0 && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t('skills.discover.usedBy', { count: skill.installs })}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground truncate">
                  {skill.authorName ?? ''}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid={`skill-discover-install-${skill.id}`}
                  disabled={setInstalled.isPending}
                  onClick={() => setInstalled.mutate({ id: skill.id, installed: true })}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  {t('skills.install')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
