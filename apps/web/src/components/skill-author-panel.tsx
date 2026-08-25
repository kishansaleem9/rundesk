import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button, Input, cn, toast } from '@rundesk/ui'
import { Check, CornerDownRight, Gem, Loader2, Send, Sparkles, X } from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import {
  proposeSkill,
  useCreateSkillFromProposal,
  type ProposalStep,
  type SkillProposal,
} from '../lib/skills-api'

/**
 * §15 — the way she actually makes a skill, `[18:17]–[18:42]`.
 *
 *   "main is ko sab cheezein batati jaoongi… Pehle to woh apna [data sketch] out
 *    karega jo main kaam kar rahi hoon… phir woh meri poori ki poori SKILL
 *    create karega… main yahan pe likhoongi: 'create a personal task organizer
 *    skill', to yeh poori ki poori skill ban jayegi."
 *
 * Frames `t1122`, `t1138`, `t1146`: a panel beside the hub with a "Skills"
 * context chip, a trace of what it is reading, an answer grounded in what it
 * found, follow-up chips, and — bolded on screen — "Approve this approach and
 * I'll create it, or tell me one tweak you want first."
 *
 * Nothing is written until that button is pressed. The gate is not a safety
 * bolt-on; it is what makes drafting from someone's real workspace reasonable
 * to do at all.
 */

type Turn =
  | { kind: 'you'; id: number; text: string }
  | { kind: 'draft'; id: number; proposal: SkillProposal; message: string; createdId?: string }
  | { kind: 'error'; id: number; text: string }

export function SkillAuthorPanel({
  workspaceId,
  onClose,
  className,
}: {
  workspaceId: string
  onClose?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateSkillFromProposal(workspaceId)

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [steps, setSteps] = useState<ProposalStep[]>([])
  const [working, setWorking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, steps, working])

  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = async (request: string) => {
    const text = request.trim()
    if (!text || working) return
    setInput('')
    setTurns((prev) => [...prev, { kind: 'you', id: Date.now(), text }])
    // Cleared per request: the trace describes *this* draft, and leaving the
    // last one up would attach old findings to a new answer.
    setSteps([])
    setWorking(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { proposal, message } = await proposeSkill(workspaceId, text, {
        onStep: (step) => setSteps((prev) => [...prev, step]),
        signal: controller.signal,
      })
      setTurns((prev) => [...prev, { kind: 'draft', id: Date.now(), proposal, message }])
    } catch (err) {
      if (controller.signal.aborted) return
      setTurns((prev) => [
        ...prev,
        { kind: 'error', id: Date.now(), text: err instanceof Error ? err.message : 'Failed' },
      ])
    } finally {
      setWorking(false)
      abortRef.current = null
    }
  }

  const approve = (turn: Extract<Turn, { kind: 'draft' }>) => {
    create.mutate(
      {
        name: turn.proposal.name,
        description: turn.proposal.description,
        instructions: turn.proposal.instructions,
        memories: turn.proposal.memories,
      },
      {
        onSuccess: (skill) => {
          toast.success(t('skills.created', { name: skill.name }))
          // Marked in place rather than removed: the conversation that produced
          // it stays readable, and the button cannot be pressed twice.
          setTurns((prev) =>
            prev.map((x) => (x.id === turn.id ? { ...x, createdId: skill.id } : x)),
          )
        },
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : t('skills.loadFailed')),
      },
    )
  }

  return (
    <div
      className={cn('flex flex-col border-l border-border/60 bg-card', className)}
      data-testid="skill-author"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{t('skills.author.title')}</span>
        </div>
        {onClose && (
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title={t('common.close')}
            data-testid="skill-author-close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {turns.length === 0 && !working && (
          <div className="text-sm text-muted-foreground space-y-3" data-testid="skill-author-intro">
            <p>{t('skills.author.intro')}</p>
            <div className="space-y-1.5">
              {OPENERS.map((key) => (
                <FollowUpChip key={key} text={t(key)} onClick={() => ask(t(key))} />
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.kind === 'you' ? (
            <div key={turn.id} className="flex justify-end">
              <div className="rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-sm max-w-[85%]">
                {turn.text}
              </div>
            </div>
          ) : turn.kind === 'error' ? (
            <p key={turn.id} className="text-sm text-destructive" data-testid="skill-author-error">
              {turn.text}
            </p>
          ) : (
            <DraftTurn
              key={turn.id}
              turn={turn}
              busy={create.isPending}
              onApprove={() => approve(turn)}
              onFollowUp={ask}
              onOpen={(skillId) =>
                navigate({
                  to: '/app/$workspaceId/skills/$skillId' as never,
                  params: { workspaceId, skillId } as never,
                })
              }
            />
          ),
        )}

        {/* The trace. Each row appears when its lookup has actually returned —
            the server emits them one at a time, so this is a report, not an
            animation. */}
        {working && (
          <div className="space-y-1.5" data-testid="skill-author-steps">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('skills.author.working')}
            </div>
            {steps.map((step, i) => (
              <div
                key={`${step.label}-${i}`}
                className="flex items-start gap-2 pl-5 text-xs text-muted-foreground"
                data-testid="skill-author-step"
              >
                <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                <span>
                  {step.label}
                  {step.finding && <span className="opacity-70"> — {step.finding}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/50 px-4 py-3 space-y-2">
        {/* Her composer's context chip, frame `t1122`. */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px]">
          <Gem className="h-3 w-3 text-primary" />
          {t('skills.title')}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('skills.author.placeholder')}
            disabled={working}
            data-testid="skill-author-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
          />
          <Button
            size="icon"
            onClick={() => ask(input)}
            disabled={!input.trim() || working}
            data-testid="skill-author-send"
            title={t('skills.author.send')}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The three openers, standing in for her first "Help me create a skill". */
const OPENERS = [
  'skills.author.opener1',
  'skills.author.opener2',
  'skills.author.opener3',
] as const

function DraftTurn({
  turn,
  busy,
  onApprove,
  onFollowUp,
  onOpen,
}: {
  turn: Extract<Turn, { kind: 'draft' }>
  busy: boolean
  onApprove: () => void
  onFollowUp: (text: string) => void
  onOpen: (skillId: string) => void
}) {
  const { t } = useTranslation()
  const { proposal, message, createdId } = turn
  return (
    <div className="space-y-3" data-testid="skill-proposal">
      {/* What it read, kept with the answer it produced. */}
      {proposal.steps.length > 0 && (
        <div className="space-y-1" data-testid="skill-proposal-steps">
          {proposal.steps.map((step, i) => (
            <div key={`${step.label}-${i}`} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
              <span>
                {step.label}
                {step.finding && <span className="opacity-70"> — {step.finding}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm whitespace-pre-wrap leading-relaxed">{message}</div>

      {createdId ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" />
            {t('skills.author.created')}
          </span>
          <Button size="sm" variant="outline" onClick={() => onOpen(createdId)} data-testid="skill-proposal-open">
            {t('skills.author.open')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onApprove} disabled={busy} data-testid="skill-proposal-approve">
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            {t('skills.author.approve')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('skills.author.orTweak')}</span>
        </div>
      )}

      {/* Frames t1122 and t1146 carry two DIFFERENT chip sets under two
          consecutive answers — they follow the answer, they are not a fixed
          menu, so they come from the proposal rather than from a constant. */}
      {!createdId && proposal.followUps.length > 0 && (
        <div className="space-y-1.5 pt-1" data-testid="skill-followups">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('skills.author.followUps')}
          </div>
          {proposal.followUps.map((text) => (
            <FollowUpChip key={text} text={text} onClick={() => onFollowUp(text)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FollowUpChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid="skill-followup"
      className="w-full text-left flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-accent/10 hover:border-primary/40 transition-colors"
    >
      <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
      <span>{text}</span>
    </button>
  )
}
