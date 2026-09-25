import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Button, Progress, cn } from '@rundesk/ui'
import {
  CheckCircle2,
  Circle,
  X,
  Layers,
  FolderKanban,
  ListChecks,
  UserPlus,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type OnboardingSteps = {
  space: boolean
  project: boolean
  task: boolean
  invite: boolean
  ai: boolean
}

type OnboardingStatus = {
  dismissed: boolean
  counts: { spaces: number; projects: number; tasks: number; members: number; aiEvents: number }
  steps: OnboardingSteps
}

type StepKey = keyof OnboardingSteps

type StepDef = {
  key: StepKey
  icon: typeof Layers
  titleKey: TranslationKey
  descKey: TranslationKey
  /** In-app destination where this step is completed. */
  to: '/app/$workspaceId' | '/app/$workspaceId/settings' | '/app/$workspaceId/ai'
}

const STEPS: StepDef[] = [
  { key: 'space', icon: Layers, titleKey: 'onboarding.stepSpaceTitle', descKey: 'onboarding.stepSpaceDesc', to: '/app/$workspaceId' },
  { key: 'project', icon: FolderKanban, titleKey: 'onboarding.stepProjectTitle', descKey: 'onboarding.stepProjectDesc', to: '/app/$workspaceId' },
  { key: 'task', icon: ListChecks, titleKey: 'onboarding.stepTaskTitle', descKey: 'onboarding.stepTaskDesc', to: '/app/$workspaceId' },
  { key: 'invite', icon: UserPlus, titleKey: 'onboarding.stepInviteTitle', descKey: 'onboarding.stepInviteDesc', to: '/app/$workspaceId/settings' },
  { key: 'ai', icon: Sparkles, titleKey: 'onboarding.stepAiTitle', descKey: 'onboarding.stepAiDesc', to: '/app/$workspaceId/ai' },
]

export function OnboardingChecklist({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['onboarding', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => api<OnboardingStatus>(`/workspaces/${workspaceId}/onboarding`),
    staleTime: 30_000,
  })

  const dismiss = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/onboarding/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      // Optimistically reflect the dismissal so the widget disappears at once.
      qc.setQueryData<OnboardingStatus>(['onboarding', workspaceId], (prev) =>
        prev ? { ...prev, dismissed: true } : prev,
      )
    },
  })

  if (!data || data.dismissed) return null

  const doneCount = STEPS.filter((s) => data.steps[s.key]).length
  const total = STEPS.length
  // Once everything is done, retire the widget entirely.
  if (doneCount >= total) return null

  const progressValue = Math.round((doneCount / total) * 100)

  return (
    <Card variant="glass" className="mb-4 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 p-4">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-accent" />
            {t('onboarding.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('onboarding.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label={t('onboarding.dismiss')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('onboarding.progress', { done: doneCount, total })}</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>

        <ul className="space-y-1.5">
          {STEPS.map((step) => {
            const done = data.steps[step.key]
            const Icon = step.icon
            return (
              <li key={step.key}>
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/50 bg-card/40',
                  )}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex items-center gap-1.5 text-sm font-medium',
                        done && 'text-muted-foreground line-through',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{t(step.titleKey)}</span>
                    </div>
                    {!done && <p className="mt-0.5 text-xs text-muted-foreground">{t(step.descKey)}</p>}
                  </div>
                  {!done && (
                    <Button variant="outline" size="sm" asChild className="shrink-0">
                      {/* Inviting is on Settings' Members tab, not General. The step is
                          done once a second person is in, so only the workspace's
                          lone maker, its admin, is shown it undone. */}
                      {step.key === 'invite' ? (
                        <Link to="/app/$workspaceId/settings" params={{ workspaceId }} search={{ tab: 'members' }} data-testid="onboarding-invite-start">
                          {t('onboarding.stepStart')}
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                        </Link>
                      ) : (
                        <Link to={step.to} params={{ workspaceId }}>
                          {t('onboarding.stepStart')}
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                        </Link>
                      )}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
