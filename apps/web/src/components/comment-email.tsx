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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type Ref } from 'react'
import { CalendarClock, ChevronDown, FileText, Mail, PenLine, X } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useDateFormat } from '../lib/date-format'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { ImapLinkDialog } from './imap-link-dialog'

export type CommentEmail = {
  direction: 'out' | 'in'
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  /** Sent from, or read from, a mailbox its writer linked (`found-9-oct/task-email-sends-from-the-server`). */
  viaMailbox?: boolean
}

/** A mailbox this person may send from: theirs, or shared with them. */
export type EmailAccount = {
  id: string
  /** `imap`: linked by its servers and its password (`found-12-oct/task-email-imap-unbuilt`). */
  provider: 'gmail' | 'outlook' | 'imap'
  address: string
  senderName: string
  status: 'connected' | 'needs_reconnect'
  lastError: string | null
  usesLeft: number | null
  owner: { id: string; name: string }
  mine: boolean
}
export type EmailSignature = { id: string; name: string; body: string; isDefault: boolean }
export type EmailTemplate = { id: string; name: string; subject: string | null; body: string; shared: boolean; mine: boolean }
export type EmailPlan = { id: string; label: string; accounts: number | null; uses: number | null; scheduling: boolean; signaturesAndTemplates: boolean }
type ProviderReadiness = { available: boolean; reason?: string }

export type CommentEmailSetup = {
  available: boolean
  reason: 'comment' | 'guest' | 'off' | 'unconfigured' | null
  message: string | null
  from: { name: string; address: string }
  /** The server's own address, "<writer> via Rundesk", when it sends mail. */
  server: { name: string; address: string } | null
  accounts: EmailAccount[]
  providers: { gmail: ProviderReadiness; outlook: ProviderReadiness; imap?: ProviderReadiness } | null
  plan: EmailPlan | null
  signatures: EmailSignature[]
  templates: EmailTemplate[]
}

/** Where an email goes from: a mailbox's id, or `server`. */
export type EmailFrom = string

/** The From the composer starts on: the first mailbox that sends, else the server's address, else none. */
export function defaultEmailFrom(setup: CommentEmailSetup | undefined): EmailFrom {
  const ready = setup?.accounts?.find((a) => a.status === 'connected')
  if (ready) return ready.id
  return setup?.server ? 'server' : ''
}

/** A mailbox's consent page, opened in this tab: the provider sends the person back to the Email settings. */
export async function linkMailbox(workspaceId: string, provider: 'gmail' | 'outlook') {
  const { authUrl } = await api<{ authUrl: string }>(`/workspaces/${workspaceId}/email-accounts/connect/${provider}`, { method: 'POST' })
  window.location.assign(authUrl)
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
  setup,
  fromId,
  onFromChange,
  workspaceId,
  draft,
  onChange,
  toInputRef,
}: {
  taskId: string
  taskTitle: string
  from: { name: string; address: string } | null
  /** The mailboxes and the server's address it can go from (`found-9-oct/task-email-sends-from-the-server`). */
  setup?: CommentEmailSetup
  fromId?: EmailFrom
  onFromChange?: (next: EmailFrom) => void
  workspaceId?: string
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
        {setup && onFromChange ? (
          <EmailFromPicker setup={setup} value={fromId ?? ''} onChange={onFromChange} workspaceId={workspaceId} />
        ) : (
          <span className="truncate" data-testid="comment-email-from">
            {from ? `${from.name} <${from.address}>` : '…'}
          </span>
        )}
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
      {email.direction === 'out' && email.viaMailbox && (
        <p data-testid={`comment-email-${commentId}-from`}>{t('taskDetail.emailSentFrom', { from: email.from })}</p>
      )}
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

/**
 * FROM: THE MAILBOXES THIS PERSON MAY SEND FROM, AND THE SERVER'S ADDRESS
 * (`found-9-oct/task-email-sends-from-the-server`). ClickUp's From lists the
 * linked accounts and offers "Link an email"; a mailbox the provider refused
 * says to link it again and is not chosen.
 */
function EmailFromPicker({
  setup,
  value,
  onChange,
  workspaceId,
}: {
  setup: CommentEmailSetup
  value: EmailFrom
  onChange: (next: EmailFrom) => void
  workspaceId?: string
}) {
  const { t } = useTranslation()
  const [imapOpen, setImapOpen] = useState(false)
  const providers = setup.providers
  const linkable = (['gmail', 'outlook', 'imap'] as const).filter((p) => providers?.[p]?.available)
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <select
        data-testid="comment-email-from-select"
        className="min-w-0 max-w-[18rem] flex-1 truncate rounded-md border border-border bg-background px-1.5 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value && <option value="">{t('taskDetail.emailNoFrom')}</option>}
        {setup.accounts.map((a) => (
          <option key={a.id} value={a.id} disabled={a.status !== 'connected'} data-provider={a.provider}>
            {a.status === 'connected' ? `${a.senderName} <${a.address}>` : t('taskDetail.emailFromNeedsReconnect', { address: a.address })}
          </option>
        ))}
        {setup.server && <option value="server">{`${setup.server.name} <${setup.server.address}>`}</option>}
      </select>
      {workspaceId && linkable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" data-testid="comment-email-link">
              {t('taskDetail.emailLinkEmail')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {linkable.map((p) => (
              <DropdownMenuItem
                key={p}
                data-testid={`comment-email-link-${p}`}
                onSelect={() => {
                  // ClickUp's "Sign in with IMAP" is a form here; Gmail and Outlook are their own sign-in.
                  if (p === 'imap') setImapOpen(true)
                  else void linkMailbox(workspaceId, p).catch((err) => toast.error(err instanceof ApiError ? err.message : String(err)))
                }}
              >
                {p === 'gmail' ? t('taskDetail.emailLinkGmail') : p === 'outlook' ? t('taskDetail.emailLinkOutlook') : t('taskDetail.emailLinkImap')}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="comment-email-settings" onSelect={() => window.location.assign(`/app/${workspaceId}/email`)}>
              {t('taskDetail.emailSettings')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {workspaceId && imapOpen && <ImapLinkDialog workspaceId={workspaceId} open={imapOpen} onOpenChange={setImapOpen} onLinked={(a) => onChange(a.id)} />}
    </span>
  )
}

/**
 * TEMPLATES AND SIGNATURES, under the subject (Business and above, as ClickUp's):
 * a template puts its subject and words in the email; a signature goes under
 * the words; what is written can be saved as a template of one's own.
 */
export function CommentEmailTools({
  setup,
  workspaceId,
  draft,
  text,
  onUseTemplate,
  onUseSignature,
}: {
  setup?: CommentEmailSetup
  workspaceId?: string
  draft: EmailDraft
  text: string
  onUseTemplate: (template: EmailTemplate) => void
  onUseSignature: (signature: EmailSignature) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const save = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/email-templates`, {
        method: 'POST',
        body: { name: name.trim(), subject: draft.subject.trim() || undefined, body: text },
      }),
    onSuccess: async () => {
      toast.success(t('taskDetail.emailTemplateSaved'))
      setNaming(false)
      setName('')
      await qc.invalidateQueries({ queryKey: ['task-email-setup'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  })
  if (!setup?.plan?.signaturesAndTemplates) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="comment-email-tools">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" data-testid="comment-email-templates">
            <FileText className="h-3 w-3" />
            {t('taskDetail.emailTemplates')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {setup.templates.length === 0 && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('taskDetail.emailTemplatesNone')}</DropdownMenuLabel>}
          {setup.templates.map((tpl) => (
            <DropdownMenuItem key={tpl.id} data-testid={`comment-email-template-${tpl.id}`} onSelect={() => onUseTemplate(tpl)}>
              {tpl.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground" data-testid="comment-email-signatures">
            <PenLine className="h-3 w-3" />
            {t('taskDetail.emailSignature')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {setup.signatures.map((sig) => (
            <DropdownMenuItem key={sig.id} data-testid={`comment-email-signature-${sig.id}`} onSelect={() => onUseSignature(sig)}>
              {sig.name}
            </DropdownMenuItem>
          ))}
          {workspaceId && (
            <>
              {setup.signatures.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => window.location.assign(`/app/${workspaceId}/email?tab=signatures`)}>{t('taskDetail.emailSettings')}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {workspaceId && !naming && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          data-testid="comment-email-save-template"
          disabled={!text.trim()}
          onClick={() => setNaming(true)}
        >
          {t('taskDetail.emailSaveTemplate')}
        </button>
      )}
      {naming && (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            data-testid="comment-email-template-name"
            className="w-40 rounded-md border border-border bg-background px-1.5 py-0.5"
            placeholder={t('taskDetail.emailTemplateName')}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) save.mutate()
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <Button size="sm" variant="outline" data-testid="comment-email-template-save" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </span>
      )}
    </div>
  )
}

/** Monday next, or today when it is Monday before nine, at nine. */
function nextMondayAtNine(now: Date): Date {
  const d = new Date(now)
  d.setHours(9, 0, 0, 0)
  const add = (8 - d.getDay()) % 7 || (now < d ? 0 : 7)
  d.setDate(d.getDate() + add)
  return d
}

/**
 * SEND LATER: the arrow beside Send, as ClickUp's — a few times, or one picked.
 * Pro and above; below, it says so rather than going missing.
 */
export function CommentEmailSchedule({ setup, disabled, onSchedule }: { setup?: CommentEmailSetup; disabled: boolean; onSchedule: (at: Date) => void }) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const [when, setWhen] = useState('')
  const allowed = setup?.plan?.scheduling === true
  const now = new Date()
  const inHour = new Date(now.getTime() + 60 * 60 * 1000)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="px-1.5" data-testid="comment-email-schedule" disabled={disabled} title={t('taskDetail.emailScheduleMenu')}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">{t('taskDetail.emailScheduleMenu')}</DropdownMenuLabel>
          {!allowed && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground" data-testid="comment-email-schedule-locked">
              {t('taskDetail.emailPlanScheduling')}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem disabled={!allowed} data-testid="comment-email-schedule-hour" onSelect={() => onSchedule(inHour)}>
            {t('taskDetail.emailScheduleInHour')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!allowed} data-testid="comment-email-schedule-tomorrow" onSelect={() => onSchedule(tomorrow)}>
            {t('taskDetail.emailScheduleTomorrow')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!allowed} data-testid="comment-email-schedule-monday" onSelect={() => onSchedule(nextMondayAtNine(now))}>
            {t('taskDetail.emailScheduleMonday')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!allowed} data-testid="comment-email-schedule-pick" onSelect={() => setPicking(true)}>
            <CalendarClock className="mr-2 h-3.5 w-3.5" />
            {t('taskDetail.emailSchedulePick')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {picking && (
        <span className="flex items-center gap-1">
          <input
            type="datetime-local"
            data-testid="comment-email-schedule-at"
            className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <Button
            size="sm"
            data-testid="comment-email-schedule-confirm"
            disabled={!when}
            onClick={() => {
              const at = new Date(when)
              if (!Number.isNaN(at.getTime())) onSchedule(at)
              setPicking(false)
              setWhen('')
            }}
          >
            {t('taskDetail.emailScheduleConfirm')}
          </Button>
        </span>
      )}
    </>
  )
}

export type ScheduledEmail = {
  id: string
  sendAt: string
  status: 'scheduled' | 'sending' | 'failed'
  error: string | null
  to: string[]
  subject: string | null
}

/**
 * THIS PERSON'S EMAILS WAITING ON THE TASK, as ClickUp shows a reminder of a
 * scheduled one: when, to whom, Send now and Cancel — and one that could not
 * go, with why.
 */
export function ScheduledEmails({ taskId }: { taskId: string }) {
  const { t } = useTranslation()
  const { formatDateTime } = useDateFormat()
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['task-email-scheduled', taskId],
    queryFn: () => api<ScheduledEmail[]>(`/tasks/${taskId}/comments/email/scheduled`),
    staleTime: 10_000,
    refetchInterval: (q) => ((q.state.data ?? []).some((e) => e.status !== 'failed') ? 15_000 : false),
  })
  const act = useMutation({
    mutationFn: ({ id, how }: { id: string; how: 'send' | 'cancel' }) =>
      how === 'send'
        ? api(`/tasks/${taskId}/comments/email/scheduled/${id}/send`, { method: 'POST' })
        : api(`/tasks/${taskId}/comments/email/scheduled/${id}`, { method: 'DELETE' }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['task-email-scheduled', taskId] })
      await qc.invalidateQueries({ queryKey: ['task', taskId, 'comments'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : String(err)),
  })
  const rows = list.data ?? []
  if (rows.length === 0) return null
  return (
    <div className="mb-2 space-y-1 rounded-md border border-border bg-muted/20 p-2 text-xs" data-testid="comment-email-scheduled">
      <p className="font-medium">{t('taskDetail.emailScheduledList')}</p>
      {rows.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-2" data-testid="comment-email-scheduled-row" data-status={e.status} data-id={e.id}>
          <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {e.status === 'failed'
              ? t('taskDetail.emailScheduledFailed', { error: e.error ?? '' })
              : t('taskDetail.emailScheduledRow', { to: e.to.join(', '), when: formatDateTime(e.sendAt) })}
            {e.subject ? ` — ${e.subject}` : ''}
          </span>
          {e.status === 'scheduled' && (
            <button type="button" className="text-accent hover:underline" data-testid="comment-email-scheduled-send" onClick={() => act.mutate({ id: e.id, how: 'send' })}>
              {t('taskDetail.emailSendNow')}
            </button>
          )}
          {e.status !== 'sending' && (
            <button type="button" className="text-muted-foreground hover:text-foreground" data-testid="comment-email-scheduled-cancel" onClick={() => act.mutate({ id: e.id, how: 'cancel' })}>
              {t('taskDetail.emailCancelScheduled')}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
