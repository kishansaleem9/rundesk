import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, cn } from '@rundesk/ui'
import { Briefcase, GraduationCap, User as UserIcon } from 'lucide-react'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/**
 * §7 — creating a workspace, the way she walks through it.
 *
 * > "Main 'New Workspace' par click karoongi, main new workspace bana sakti
 * >  hoon — [phir] same layout jo aap ne abhi kiya tha [signup ke waqt]."
 * >  [08:43]
 * > "Skip [ya] step, aur yahan se different tool search kar sakti hoon."
 * >  [08:54]
 * > "[Phir] poochega — 'xyz' likhoongi to meri new workspace ka naam hai, aur
 * >  main is ko Finish karoongi to meri workspace ban jayegi." [09:02]
 *
 * This was one text field and a Save button. Three things about her version are
 * not decoration:
 *
 *   It asks what the workspace is for, and that answer decides what the empty
 *   workspace starts with. A "Study" space is a different first move from a
 *   "Team" one.
 *
 *   The tool step is skippable, and she points at the skip herself. A step you
 *   cannot pass is an interrogation.
 *
 *   Both answers are kept. The frame pass caught the equivalent step collecting
 *   answers and discarding them, which is worse than never asking — it spends
 *   somebody's attention and returns nothing.
 *
 * Name comes first rather than last, unlike her walkthrough: the whole thing is
 * cancellable, and the one field that is actually required should not be the
 * one you reach after two optional screens.
 */

export type WorkspaceDraft = { name: string; purpose?: string; comingFrom?: string }

const PURPOSES: Array<{ value: string; labelKey: TranslationKey; icon: typeof Briefcase }> = [
  { value: 'work', labelKey: 'workspaceFlow.purposeWork', icon: Briefcase },
  { value: 'personal', labelKey: 'workspaceFlow.purposePersonal', icon: UserIcon },
  { value: 'school', labelKey: 'workspaceFlow.purposeSchool', icon: GraduationCap },
]

/** The tools people arrive from. Searchable, because the list is never complete. */
const TOOLS = ['ClickUp', 'Asana', 'Trello', 'Jira', 'Monday.com', 'Notion', 'Linear', 'Basecamp', 'Wrike', 'Smartsheet']

type Step = 'name' | 'purpose' | 'comingFrom'
const STEPS: Step[] = ['name', 'purpose', 'comingFrom']

export function CreateWorkspaceFlow({
  open,
  onOpenChange,
  onFinish,
  submitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinish: (draft: WorkspaceDraft) => void
  submitting?: boolean
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<string | undefined>()
  const [comingFrom, setComingFrom] = useState<string | undefined>()
  const [toolQuery, setToolQuery] = useState('')

  // Reopening starts over. A half-finished draft from last time is a surprise,
  // not a convenience.
  useEffect(() => {
    if (!open) return
    setStep('name')
    setName('')
    setPurpose(undefined)
    setComingFrom(undefined)
    setToolQuery('')
  }, [open])

  const index = STEPS.indexOf(step)
  const finish = (draft: WorkspaceDraft) => onFinish(draft)
  const matches = TOOLS.filter((tool) => tool.toLowerCase().includes(toolQuery.trim().toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-workspace-flow">
        <DialogHeader>
          <DialogTitle>{t('nav.newWorkspace')}</DialogTitle>
        </DialogHeader>

        {/* Where you are, so three screens do not feel like an unknown number. */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn('h-1 flex-1 rounded-full', i <= index ? 'bg-brand-500' : 'bg-border')}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="workspace-step">
          {t('workspaceFlow.stepOf', { current: String(index + 1), total: String(STEPS.length) })}
        </p>

        {step === 'name' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim().length >= 2) setStep('purpose')
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">{t('workspaceFlow.nameLabel')}</Label>
              <Input
                id="ws-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('workspaceFlow.namePlaceholder')}
                data-testid="workspace-name"
              />
            </div>
            <Button type="submit" className="w-full" disabled={name.trim().length < 2} data-testid="workspace-next">
              {t('workspaceFlow.next')}
            </Button>
          </form>
        )}

        {step === 'purpose' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('workspaceFlow.purposeQuestion')}</p>
            <div className="grid gap-2">
              {PURPOSES.map((choice) => {
                const Icon = choice.icon
                return (
                  <button
                    key={choice.value}
                    type="button"
                    data-testid={`workspace-purpose-${choice.value}`}
                    onClick={() => {
                      setPurpose(choice.value)
                      setStep('comingFrom')
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      purpose === choice.value
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-border hover:bg-accent/10',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {t(choice.labelKey)}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('name')}>
                {t('workspaceFlow.back')}
              </Button>
              {/* Skippable like the step after it: a workspace should not be
                  unreachable because somebody had no opinion about this. */}
              <Button variant="ghost" className="flex-1" onClick={() => setStep('comingFrom')} data-testid="workspace-skip-purpose">
                {t('workspaceFlow.skip')}
              </Button>
            </div>
          </div>
        )}

        {step === 'comingFrom' && (
          <div className="space-y-3">
            {/* "yahan se different tool search kar sakti hoon" [08:54] */}
            <p className="text-sm text-muted-foreground">{t('workspaceFlow.comingFromQuestion')}</p>
            <Input
              value={toolQuery}
              onChange={(e) => setToolQuery(e.target.value)}
              placeholder={t('workspaceFlow.comingFromPlaceholder')}
              data-testid="workspace-tool-search"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {matches.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  data-testid={`workspace-tool-${tool.toLowerCase().replace(/[^a-z]/g, '')}`}
                  onClick={() => setComingFrom(tool)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    comingFrom === tool ? 'border-brand-500 bg-brand-500/10' : 'border-border hover:bg-accent/10',
                  )}
                >
                  {tool}
                </button>
              ))}
              {matches.length === 0 && toolQuery.trim() && (
                // Whatever they typed is a real answer — the list of tools that
                // exist is not ours to close.
                <button
                  type="button"
                  data-testid="workspace-tool-other"
                  onClick={() => setComingFrom(toolQuery.trim())}
                  className="w-full rounded-md border border-dashed border-border px-3 py-2 text-left text-sm hover:bg-accent/10"
                >
                  {t('workspaceFlow.useTyped', { name: toolQuery.trim() })}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('purpose')}>
                {t('workspaceFlow.back')}
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                disabled={submitting}
                data-testid="workspace-skip-tool"
                // "Skip ya step" — a skip finishes, it does not stall.
                onClick={() => finish({ name: name.trim(), purpose })}
              >
                {t('workspaceFlow.skip')}
              </Button>
            </div>
            <Button
              className="w-full"
              disabled={submitting}
              data-testid="workspace-finish"
              onClick={() => finish({ name: name.trim(), purpose, comingFrom })}
            >
              {submitting ? t('workspaceFlow.creating') : t('workspaceFlow.finish')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
