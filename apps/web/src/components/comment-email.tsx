/**
 * THE COMMENT BOX'S EMAIL (`resume-defects/s4-composer-email`,
 * `ledger-rows/row-1252`, `suite-hygiene/task-mentions-pins-unbuilt-email-mode`).
 *
 * ClickUp's Email ClickApp: Comment ▾ → Email turns the task's comment box into
 * an email — From, To, CC and BCC, a subject, the words and the files — and
 * Send sends it. The email stays in the task's activity with who it went to,
 * and the answers of the people it went to land under it; one that came in is
 * answered as a comment or by email.
 *
 * Here: the form's parts (`CommentEmailFields`), what the box asks the server
 * before it offers Email (`useCommentEmailSetup`), and an email comment's
 * envelope in the thread (`CommentEmailEnvelope`). The sheet's composer keeps
 * the words and the files, as it does for a comment, and sends.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Ref } from 'react'
import { Mail, X } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

export type CommentEmail = {
  direction: 'out' | 'in'
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
}

export type CommentEmailSetup = {
  available: boolean
  reason: 'comment' | 'guest' | 'off' | 'unconfigured' | null
  message: string | null
  from: { name: string; address: string }
}

/** Whether this person may send email from this task, and why not; who it goes from. */
export function useCommentEmailSetup(taskId: string) {
  return useQuery({
    queryKey: ['task-email-setup', taskId],
    queryFn: () => api<CommentEmailSetup>(`/tasks/${taskId}/comments/email`),
    staleTime: 30_000,
  })
}

const REASON_KEY: Record<'guest' | 'off' | 'unconfigured', TranslationKey> = {
  guest: 'taskDetail.emailReasonGuest',
  off: 'taskDetail.emailReasonOff',
  unconfigured: 'taskDetail.emailReasonUnconfigured',
}

/** Why Email cannot be chosen, in the reader's language; the server's own words for the comment rule. */
export function emailUnavailableReason(t: (key: TranslationKey) => string, setup: CommentEmailSetup | undefined, failed: boolean): string {
  if (failed) return t('taskDetail.emailSetupFailed')
  if (!setup) return t('taskDetail.emailChecking')
  if (setup.reason === 'comment') return setup.message ?? t('taskDetail.commentsLocked')
  return setup.reason ? t(REASON_KEY[setup.reason]) : ''
}

/** The people an answer by email goes to, and its subject: whoever wrote the email answered, else whom it went to. */
export function emailAnswerDefaults(email: CommentEmail): { to: string[]; subject: string } {
  const subject = /^re:/i.test(email.subject.trim()) ? email.subject.trim() : `Re: ${email.subject.trim()}`
  return { to: email.direction === 'in' ? [email.from] : email.to, subject }
}

// As the server reads an address (`comment-email.ts`): something, an @, a domain with a dot.
const looksLikeAddress = (s: string) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(s.trim())

type Suggestion = { address: string; name: string | null; source: 'field' | 'contact' | 'member' }

/** One of To, CC and BCC: its addresses as chips, a box to type one, and suggestions as it is typed. */
function AddressRow({
  taskId,
  field,
  label,
  values,
  onChange,
  inputRef,
}: {
  taskId: string
  field: 'to' | 'cc' | 'bcc'
  label: string
  values: string[]
  onChange: (next: string[]) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // Asked as the person pauses, not on every key.
  useEffect(() => {
    const id = setTimeout(() => setQ(draft.trim()), 200)
    return () => clearTimeout(id)
  }, [draft])
  const suggestions = useQuery({
    queryKey: ['task-email-suggestions', taskId, q],
    queryFn: () => api<Suggestion[]>(`/tasks/${taskId}/comments/email/suggestions?q=${encodeURIComponent(q)}`),
    enabled: open && q.length > 0,
    staleTime: 30_000,
  })
  const commit = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)
    if (parts.length === 0) return
    onChange([...values, ...parts.filter((p) => !values.includes(p))])
    setDraft('')
  }
  const shown = (suggestions.data ?? []).filter((s) => !values.includes(s.address))
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-12 shrink-0 pt-1.5 text-muted-foreground">{label}</span>
      <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1" data-testid={`comment-email-${field}`}>
        {values.map((v) => (
          <span
            key={v}
            data-testid="comment-email-chip"
            data-address={v}
            data-valid={looksLikeAddress(v) ? 'yes' : 'no'}
            className={
              looksLikeAddress(v)
                ? 'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5'
                : 'inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-600'
            }
          >
            {v}
            <button type="button" aria-label={t('taskDetail.emailRemoveAddress', { address: v })} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          data-testid={`comment-email-${field}-input`}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 outline-none"
          value={draft}
          placeholder={values.length === 0 ? t('taskDetail.emailAddressPlaceholder') : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && draft.trim())) {
              if (!draft.trim()) return
              e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          // A suggestion is pressed before the box loses the cursor: committed on blur, it would be the draft.
          onBlur={() => {
            setTimeout(() => setOpen(false), 150)
            if (draft.trim()) commit(draft)
          }}
        />
        {open && shown.length > 0 && (
          <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md" data-testid={`comment-email-${field}-suggestions`}>
            {shown.map((s) => (
              <li key={s.address}>
                <button
                  type="button"
                  data-testid={`comment-email-suggestion-${s.address}`}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange([...values, s.address])
                    setDraft('')
                  }}
                >
                  <span className="truncate">{s.name ? `${s.name} <${s.address}>` : s.address}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{t(`taskDetail.emailSource.${s.source}` as TranslationKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export type EmailDraft = { to: string[]; cc: string[]; bcc: string[]; subject: string }

/**
 * From, To, CC, BCC and Subject, over the composer's words. CC and BCC are
 * opened from their buttons, as ClickUp's are; the subject is the task's title
 * until one is typed.
 */
export function CommentEmailFields({
  taskId,
  taskTitle,
  from,
  draft,
  onChange,
  toInputRef,
}: {
  taskId: string
  taskTitle: string
  from: { name: string; address: string } | null
  draft: EmailDraft
  onChange: (next: EmailDraft) => void
  /** The To box, for the composer to put the cursor in once Email is chosen. */
  toInputRef?: Ref<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const [showCc, setShowCc] = useState(draft.cc.length > 0)
  const [showBcc, setShowBcc] = useState(draft.bcc.length > 0)
  const toRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (draft.cc.length) setShowCc(true)
    if (draft.bcc.length) setShowBcc(true)
  }, [draft.cc.length, draft.bcc.length])
  return (
    <div className="mb-2 space-y-1.5 rounded-md border border-border bg-muted/20 p-2" data-testid="comment-email-form" ref={toRef}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-12 shrink-0 text-muted-foreground">{t('taskDetail.emailFrom')}</span>
        <span className="truncate" data-testid="comment-email-from">
          {from ? `${from.name} <${from.address}>` : '…'}
        </span>
        <span className="ml-auto flex gap-2">
          {!showCc && (
            <button type="button" className="text-muted-foreground hover:text-foreground" data-testid="comment-email-show-cc" onClick={() => setShowCc(true)}>
              {t('taskDetail.emailCc')}
            </button>
          )}
          {!showBcc && (
            <button type="button" className="text-muted-foreground hover:text-foreground" data-testid="comment-email-show-bcc" onClick={() => setShowBcc(true)}>
              {t('taskDetail.emailBcc')}
            </button>
          )}
        </span>
      </div>
      <AddressRow taskId={taskId} field="to" label={t('taskDetail.emailTo')} values={draft.to} onChange={(to) => onChange({ ...draft, to })} inputRef={toInputRef} />
      {showCc && <AddressRow taskId={taskId} field="cc" label={t('taskDetail.emailCc')} values={draft.cc} onChange={(cc) => onChange({ ...draft, cc })} />}
      {showBcc && <AddressRow taskId={taskId} field="bcc" label={t('taskDetail.emailBcc')} values={draft.bcc} onChange={(bcc) => onChange({ ...draft, bcc })} />}
      <div className="flex items-center gap-2 text-xs">
        <span className="w-12 shrink-0 text-muted-foreground">{t('taskDetail.emailSubject')}</span>
        <input
          data-testid="comment-email-subject"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 outline-none"
          value={draft.subject}
          placeholder={taskTitle}
          maxLength={255}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
        />
      </div>
    </div>
  )
}

/**
 * An email comment's envelope in the thread: sent, with whom it went to and its
 * subject — its blind copies only on its writer's screen, as the server sends
 * them — or an answer that came in, with who wrote it.
 */
export function CommentEmailEnvelope({ commentId, email }: { commentId: string; email: CommentEmail }) {
  const { t } = useTranslation()
  const list = (xs: string[]) => xs.join(', ')
  return (
    <div className="mt-1 space-y-0.5 rounded border border-border/70 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground" data-testid={`comment-email-${commentId}`} data-direction={email.direction}>
      <p className="flex items-center gap-1 font-medium text-foreground">
        <Mail className="h-3 w-3" />
        {email.direction === 'out' ? t('taskDetail.emailSentBadge') : t('taskDetail.emailReceivedBadge', { from: email.from })}
      </p>
      {email.direction === 'out' && (
        <>
          <p data-testid={`comment-email-${commentId}-to`}>{t('taskDetail.emailToLine', { to: list(email.to) })}</p>
          {email.cc.length > 0 && <p data-testid={`comment-email-${commentId}-cc`}>{t('taskDetail.emailCcLine', { cc: list(email.cc) })}</p>}
          {email.bcc.length > 0 && <p data-testid={`comment-email-${commentId}-bcc`}>{t('taskDetail.emailBccLine', { bcc: list(email.bcc) })}</p>}
        </>
      )}
      <p data-testid={`comment-email-${commentId}-subject`}>{t('taskDetail.emailSubjectLine', { subject: email.subject })}</p>
    </div>
  )
}
