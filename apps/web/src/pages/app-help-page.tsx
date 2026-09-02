import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
} from '@rundesk/ui'
import {
  CheckCircle2,
  UserPlus,
  Target,
  Command,
  Mail,
  LifeBuoy,
  BookOpen,
  Search,
  Sparkles,
  Loader2,
  ArrowRight,
  CalendarClock,
  Plus,
  X,
} from 'lucide-react'
import { toast } from '@rundesk/ui'
import { useTranslation } from '../lib/i18n'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { SUPPORT_EMAIL } from '../lib/support'

/** An hour from now, as `datetime-local` wants it: local wall time, no zone. */
function defaultSlot(offsetHours: number): string {
  const at = new Date(Date.now() + offsetHours * 60 * 60 * 1000)
  at.setMinutes(0, 0, 0)
  return new Date(at.getTime() - at.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16)
}

/**
 * §G06 [07:30] — "main ClickUp ki team se DIRECT COMMUNICATION bhi kar sakti
 * hoon, kyunke main MEETING SCHEDULE bhi start kar sakti hoon."
 *
 * Help had two of the three routes she named — read the docs, or open a ticket
 * — and the third was a `mailto:`. This is the third.
 *
 * It offers times rather than showing slots, and says so. We do not model the
 * support team's availability, and a picker that hands out slots nobody has
 * published is a booking that cannot be kept: better to ask when suits you and
 * have a person confirm, which is also what happens after a "booking" anyway.
 */
function BookCallCard() {
  const { t } = useTranslation()
  const workspaces = useAuthStore((s) => s.workspaces)
  const workspaceId = workspaces?.[0]?.id
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<string[]>([defaultSlot(24)])
  const [sent, setSent] = useState(false)

  const request = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/support/tickets', {
        method: 'POST',
        body: {
          workspaceId,
          subject: reason.trim() || t('help.bookCallDefaultSubject'),
          body: reason.trim(),
          kind: 'call',
          requestedSlots: slots.map((s) => new Date(s).toISOString()),
        },
      }),
    onSuccess: () => {
      setSent(true)
      setOpen(false)
      toast.success(t('help.bookCallSent'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  // No workspace, no ticket queue to land in. Saying so beats a button that
  // fails on press.
  if (!workspaceId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          {t('help.bookCallTitle')}
        </CardTitle>
        <CardDescription>{t('help.bookCallDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sent ? (
          <p className="text-sm text-muted-foreground" data-testid="book-call-sent">
            {t('help.bookCallConfirmed')}
          </p>
        ) : !open ? (
          <Button data-testid="book-call-open" onClick={() => setOpen(true)}>
            <CalendarClock className="h-4 w-4" />
            {t('help.bookCallCta')}
          </Button>
        ) : (
          <div className="space-y-3" data-testid="book-call-form">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('help.bookCallReason')}</label>
              <Input
                autoFocus
                value={reason}
                data-testid="book-call-reason"
                placeholder={t('help.bookCallReasonPlaceholder')}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('help.bookCallWhen')}</label>
              {slots.map((slot, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={slot}
                    data-testid={`book-call-slot-${i}`}
                    onChange={(e) =>
                      setSlots((prev) => prev.map((s, idx) => (idx === i ? e.target.value : s)))
                    }
                    className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                  />
                  {slots.length > 1 && (
                    <button
                      type="button"
                      aria-label={t('help.bookCallRemoveSlot')}
                      onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {/* Three is the cap the server takes seriously; beyond that it is
                  not "when suits you", it is a calendar dump. */}
              {slots.length < 3 && (
                <button
                  type="button"
                  data-testid="book-call-add-slot"
                  onClick={() => setSlots((prev) => [...prev, defaultSlot(24 * (prev.length + 1))])}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  {t('help.bookCallAddSlot')}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('help.bookCallNotBooked')}</p>
            <div className="flex gap-2">
              <Button
                data-testid="book-call-submit"
                disabled={request.isPending || slots.length === 0}
                onClick={() => request.mutate()}
              >
                {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                {t('help.bookCallSubmit')}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type HelpSource = { type: string; id: string; title: string; url: string }
type HelpAnswer = { answer: string; sources: HelpSource[]; source: 'ai' | 'faq' }

export function HelpPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<HelpAnswer | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  // Each FAQ carries a stable `id` (its on-page anchor, matching the backend
  // help-topic slugs) and a `plain` string so the search box can match answer
  // text, not just the question.
  const faqs = useMemo(
    () => [
      {
        id: 'create-task',
        icon: CheckCircle2,
        question: t('help.q1'),
        plain: [t('help.a1Pre'), t('help.a1New'), t('help.a1Mid1'), t('help.a1Task'), t('help.a1Mid2'), t('help.a1Mid3'), t('help.a1Post')].join(' '),
        answer: (
          <>
            {t('help.a1Pre')}{' '}
            <span className="font-medium text-foreground">{t('help.a1New')}</span>{' '}
            {t('help.a1Mid1')}{' '}
            <span className="font-medium text-foreground">{t('help.a1Task')}</span>
            {t('help.a1Mid2')}{' '}
            <Kbd>⌘K</Kbd>{t('help.a1Mid3')}{' '}
            <Kbd>↵</Kbd> {t('help.a1Post')}
          </>
        ),
      },
      {
        id: 'invite-members',
        icon: UserPlus,
        question: t('help.q2'),
        plain: [t('help.a2Pre'), t('help.a2Settings'), t('help.a2Mid1'), t('help.a2Members'), t('help.a2Post')].join(' '),
        answer: (
          <>
            {t('help.a2Pre')}{' '}
            <span className="font-medium text-foreground">{t('help.a2Settings')}</span>{' '}
            {t('help.a2Mid1')}{' '}
            <span className="font-medium text-foreground">{t('help.a2Members')}</span>{' '}
            {t('help.a2Post')}
          </>
        ),
      },
      {
        id: 'sprints',
        icon: Target,
        question: t('help.q3'),
        plain: [t('help.a3Pre'), t('help.a3Sprints'), t('help.a3Post')].join(' '),
        answer: (
          <>
            {t('help.a3Pre')}{' '}
            <span className="font-medium text-foreground">{t('help.a3Sprints')}</span>{' '}
            {t('help.a3Post')}
          </>
        ),
      },
      {
        id: 'shortcuts',
        icon: Command,
        question: t('help.q4'),
        plain: [t('help.a4Pre'), t('help.a4Mid1'), t('help.a4Post')].join(' '),
        answer: (
          <>
            {t('help.a4Pre')} <Kbd>⌘K</Kbd> {t('help.a4Mid1')} <Kbd>Ctrl K</Kbd>{' '}
            {t('help.a4Post')}
          </>
        ),
      },
    ],
    [t],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredFaqs = normalizedQuery
    ? faqs.filter(
        (faq) =>
          faq.question.toLowerCase().includes(normalizedQuery) ||
          faq.plain.toLowerCase().includes(normalizedQuery),
      )
    : faqs

  const ask = useMutation({
    mutationFn: (q: string) => api<HelpAnswer>('/ai/help', { method: 'POST', body: { question: q } }),
    onSuccess: (data) => {
      setResult(data)
      setAskError(null)
    },
    onError: (err) => setAskError(err instanceof Error ? err.message : t('help.askError')),
  })

  function submitAsk() {
    const q = question.trim()
    if (!q || ask.isPending) return
    ask.mutate(q)
  }

  // Deep-link a cited source to its on-page FAQ card; clear any active filter so
  // the target isn't hidden, then smooth-scroll to it.
  function openSource(src: HelpSource) {
    const anchor = `help-${src.id}`
    setQuery('')
    requestAnimationFrame(() => {
      const el = typeof document !== 'undefined' ? document.getElementById(anchor) : null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">
          {t('help.eyebrow')}
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {t('help.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('help.subtitle')}
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* AI help assistant (Plan §14.4) */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  {t('help.askHeading')}
                </CardTitle>
                <CardDescription>{t('help.askDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t('help.askPlaceholder')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitAsk()
                    }}
                    className="flex-1"
                  />
                  <Button onClick={submitAsk} disabled={!question.trim() || ask.isPending}>
                    {ask.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> {t('help.askThinking')}</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1.5" /> {t('help.askButton')}</>
                    )}
                  </Button>
                </div>

                {askError && (
                  <p className="text-sm text-destructive">{askError}</p>
                )}

                {result && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          result.source === 'ai'
                            ? 'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent/15 text-accent'
                            : 'text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground'
                        }
                      >
                        {result.source === 'ai' ? t('help.aiBadge') : t('help.faqBadge')}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">{result.answer}</p>
                    {result.sources.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {t('help.askSources')}
                        </p>
                        <ul className="space-y-1">
                          {result.sources.map((src) => (
                            <li key={`${src.type}-${src.id}`}>
                              <button
                                type="button"
                                onClick={() => openSource(src)}
                                className="group flex w-full items-center gap-2 text-left text-sm rounded-md border border-border px-3 py-1.5 hover:bg-muted/50 transition-colors"
                              >
                                <ArrowRight className="h-3.5 w-3.5 text-accent shrink-0" />
                                <span className="flex-1 truncate group-hover:underline">{src.title}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold text-foreground">
                {t('help.faqHeading')}
              </h2>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('help.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            {filteredFaqs.length === 0 ? (
              <Card className="p-4 text-center text-sm text-muted-foreground">
                {t('help.noResults')}
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredFaqs.map((faq) => (
                  <Card key={faq.id} id={`help-${faq.id}`} className="scroll-mt-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <faq.icon className="h-4 w-4 text-accent shrink-0" />
                        {faq.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-accent" />
                  {t('help.contactTitle')}
                </CardTitle>
                <CardDescription>
                  {t('help.contactDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('help.contactBody')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <a href={`mailto:${SUPPORT_EMAIL}`}>
                      <Mail className="h-4 w-4" />
                      {t('help.emailSupport')}
                    </a>
                  </Button>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* §G06 [07:30] — the third route she named: talk to a person. */}
            <div className="mt-4">
              <BookCallCard />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-muted/40 border border-border/40 rounded text-muted-foreground">
      {children}
    </kbd>
  )
}
