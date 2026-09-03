import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { Button, Input, Badge, cn } from '@rundesk/ui'
import {
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { useTranslation } from '../lib/i18n'
import { ListSkeleton } from '../components/loading-skeletons'
import { useAuthStore } from '../store/auth'
import {
  isJoinable,
  untilLabel,
  useAskMeetings,
  useMeetings,
  useUpcomingMeetings,
  type Meeting,
} from '../lib/meetings-api'

/**
 * §2.8 — "yeh MEETINGS wali cheez hai — yahan pe aap ko show hongi meetings"
 * `[19:16]`. The place all meetings live.
 *
 * The API for every part of this already existed — list, get, attendees,
 * action items, migration `0092` — and there was no page and no route. You
 * could record a meeting from the AI panel's Meeting notes tab and then never
 * find it again: an endpoint with no button.
 *
 * Deliberately NOT here: starting a call. SyncUp needs decisions about WebRTC
 * infrastructure and about recording consent that are not ours to make
 * quietly, and a Start-call button that did nothing would be worse than none.
 */
export function MeetingsPage() {
  const { workspaceId } = useParams({ strict: false }) as { workspaceId: string }
  // §G14-15 — the meeting a link points at, if any. `strict: false` for the
  // same reason useParams above uses it: this component is also rendered
  // outside its own route in tests and shells.
  const { meeting: linkedMeetingId } = useSearch({ strict: false }) as { meeting?: string }
  const { t } = useTranslation()
  const me = useAuthStore((s) => s.user)

  const meetingsQuery = useMeetings(workspaceId)
  const { data: upcoming = [] } = useUpcomingMeetings(workspaceId)

  const [query, setQuery] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [tag, setTag] = useState<string | null>(null)

  const all = meetingsQuery.data
  /*
   * The chips are the tags in use, sorted, de-duplicated case-insensitively so
   * "Standup" and "standup" are one chip rather than two that look identical.
   */
  const allTags = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of all ?? []) for (const raw of m.tags ?? []) {
      const key = raw.toLowerCase()
      if (!seen.has(key)) seen.set(key, raw)
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [all])

  const filtered = useMemo(() => {
    const rows = all ?? []
    const needle = query.trim().toLowerCase()
    return rows.filter((m) => {
      if (mineOnly && m.createdById !== me?.id) return false
      if (tag && !(m.tags ?? []).includes(tag)) return false
      if (!needle) return true
      return (
        m.title.toLowerCase().includes(needle) ||
        (m.notes ?? '').toLowerCase().includes(needle) ||
        m.attendees.some((a) => (a.name ?? a.email ?? '').toLowerCase().includes(needle))
      )
    })
  }, [all, query, mineOnly, tag, me?.id])

  return (
    <div className="p-6 space-y-6" data-testid="meetings-page">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          {t('nav.meetings')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">{t('meetings.subtitle')}</p>
      </header>

      <MeetingsAsk workspaceId={workspaceId} name={me?.displayName?.split(' ')[0] ?? ''} />

      <UpcomingMeetings meetings={upcoming} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{t('meetings.notes')}</h2>
            <button
              data-testid="meetings-mine"
              onClick={() => setMineOnly((v) => !v)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                mineOnly
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border/70 text-muted-foreground hover:text-foreground',
              )}
            >
              {t('meetings.myNotes')}
            </button>
            {/*
              §A6 [19:16–19:20] — "the label 'Tags:' followed by chips".
              Built from the tags actually in use rather than a fixed list: a
              chip for a tag nobody has applied filters to an empty page, which
              is a control that can only disappoint.
            */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1" data-testid="meetings-tags">
                <span className="text-[11px] text-muted-foreground">{t('meetings.tagsLabel')}</span>
                {allTags.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTag((cur) => (cur === name ? null : name))}
                    aria-pressed={tag === name}
                    data-testid={`meetings-tag-${name}`}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                      tag === name
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/70 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('meetings.search')}
              className="pl-8 h-8 w-56"
              data-testid="meetings-search"
            />
          </div>
        </div>

        {meetingsQuery.isLoading ? (
          <ListSkeleton rows={3} />
        ) : meetingsQuery.isError ? (
          <p className="text-sm text-destructive">{t('meetings.loadFailed')}</p>
        ) : filtered.length === 0 ? (
          <EmptyNotes searching={query.trim().length > 0 || mineOnly} />
        ) : (
          <ul className="space-y-2" data-testid="meetings-list">
            {filtered.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                workspaceId={workspaceId}
                highlighted={meeting.id === linkedMeetingId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * §2.8 — "Upcoming Meetings" with a Join pill and her proximity badge.
 *
 * When there is nothing upcoming it offers to connect a calendar, which is the
 * actual reason the list is empty for most people — Rundesk already has
 * calendar sync, so this is a door rather than an apology.
 */
function UpcomingMeetings({ meetings }: { meetings: Meeting[] }) {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ strict: false }) as { workspaceId: string }
  return (
    <section className="space-y-2" data-testid="meetings-upcoming">
      <h2 className="text-sm font-medium flex items-center gap-1.5">
        <CalendarClock className="h-4 w-4 text-primary" />
        {t('meetings.upcoming')}
      </h2>
      {meetings.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border/70 px-4 py-4 flex flex-wrap items-center justify-between gap-3"
          data-testid="meetings-connect-calendar"
        >
          <p className="text-sm text-muted-foreground">{t('meetings.noUpcoming')}</p>
          <Button asChild size="sm" variant="outline">
            <Link to={'/app/$workspaceId/settings' as never} params={{ workspaceId } as never} search={{ tab: 'integrations' } as never}>
              <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
              {t('meetings.connectCalendar')}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {meetings.map((meeting) => {
            const until = untilLabel(meeting.startsAt)
            const joinable = isJoinable(meeting.startsAt)
            return (
              <li
                key={meeting.id}
                data-testid={`meeting-upcoming-${meeting.id}`}
                className="rounded-xl border border-border/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{meeting.title}</span>
                    {until && (
                      <Badge
                        variant={joinable ? 'default' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {until === 'now' ? t('meetings.now') : until}
                      </Badge>
                    )}
                  </div>
                  {meeting.attendees.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {meeting.attendees
                        .map((a) => a.name ?? a.email)
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
                {/* No join link means there is nothing to join — offering a
                    dead button would be worse than offering none. */}
                {meeting.joinUrl && (
                  <Button
                    asChild
                    size="sm"
                    variant={joinable ? 'default' : 'outline'}
                    data-testid={`meeting-join-${meeting.id}`}
                  >
                    <a href={meeting.joinUrl} target="_blank" rel="noreferrer">
                      {t('meetings.join')}
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MeetingRow({
  meeting,
  workspaceId,
  highlighted,
}: {
  meeting: Meeting
  workspaceId: string
  /** Arrived here from a link pointing at this one — say which. */
  highlighted?: boolean
}) {
  const { t } = useTranslation()
  const when = meeting.startsAt ?? meeting.createdAt
  const row = useRef<HTMLLIElement | null>(null)
  /*
   * §G14-15 — bring the linked meeting into view.
   *
   * Marking it without scrolling would leave a highlighted row somewhere below
   * the fold, which reads exactly like a link that did nothing.
   */
  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])
  return (
    <li
      ref={row}
      className={cn(
        'rounded-xl border px-4 py-3',
        highlighted ? 'border-accent bg-accent/5' : 'border-border/70',
      )}
      data-testid={`meeting-${meeting.id}`}
      data-highlighted={highlighted ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{meeting.title}</span>
            {!meeting.notes && (
              // Said plainly rather than shown as an empty row: a meeting with
              // no notes looks identical to one whose notes failed to load.
              <Badge variant="outline" className="text-[10px] shrink-0">
                {t('meetings.noNotes')}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(when).toLocaleString()}
            {meeting.attendees.length > 0 &&
              ` · ${meeting.attendees.map((a) => a.name ?? a.email).filter(Boolean).join(', ')}`}
          </p>
          {meeting.notes && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{meeting.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/*
            * §2.8 — one link per piece that was actually captured.
            *
            * Recording is a toggle: stopping for a private aside and starting
            * again leaves two files, and for a long time only the first was
            * ever offered — the rest sat in storage with nothing pointing at
            * them. When there is one piece this reads exactly as it always did.
            */}
          {(meeting.recordings?.length ? meeting.recordings : [meeting.recordingUrl])
            .filter((url): url is string => Boolean(url))
            .map((url, i, all) => (
              <Button asChild size="sm" variant="ghost" key={url}>
                <a href={url} target="_blank" rel="noreferrer" data-testid="meeting-recording">
                  <Video className="h-3.5 w-3.5 mr-1.5" />
                  {all.length > 1
                    ? t('meetings.recordingPart', { n: i + 1, of: all.length })
                    : t('meetings.recording')}
                </a>
              </Button>
            ))}
          {meeting.taskId && (
            <Button asChild size="sm" variant="ghost">
              <Link
                to={'/app/$workspaceId/tasks/$taskId' as never}
                params={{ workspaceId, taskId: meeting.taskId } as never}
              >
                {t('meetings.openTask')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function EmptyNotes({ searching }: { searching: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="py-10 text-center space-y-2" data-testid="meetings-empty">
      <p className="text-sm text-muted-foreground">
        {searching ? t('meetings.noMatches') : t('meetings.empty')}
      </p>
      {!searching && <p className="text-xs text-muted-foreground">{t('meetings.emptyHint')}</p>}
    </div>
  )
}

/** §2.8 — "Hey {name}! Ready to dive into your meetings?" with her four chips. */
function MeetingsAsk({ workspaceId, name }: { workspaceId: string; name: string }) {
  const { t } = useTranslation()
  const ask = useAskMeetings(workspaceId)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{ answer: string; grounded: boolean } | null>(null)

  const send = (text: string) => {
    const asked = text.trim()
    if (!asked || ask.isPending) return
    setQuestion('')
    ask.mutate(asked, {
      onSuccess: setAnswer,
      onError: (err: unknown) =>
        setAnswer({
          answer: err instanceof Error ? err.message : t('meetings.loadFailed'),
          grounded: false,
        }),
    })
  }

  const STARTERS = [
    'meetings.ask.starter1',
    'meetings.ask.starter2',
    'meetings.ask.starter3',
    'meetings.ask.starter4',
  ] as const

  return (
    <section
      className="rounded-xl border border-border/70 bg-card p-4 space-y-3"
      data-testid="meetings-ask"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {name ? t('meetings.ask.greetingNamed', { name }) : t('meetings.ask.greeting')}
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('meetings.ask.placeholder')}
          disabled={ask.isPending}
          data-testid="meetings-ask-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              send(question)
            }
          }}
        />
        <Button
          onClick={() => send(question)}
          disabled={!question.trim() || ask.isPending}
          data-testid="meetings-ask-send"
        >
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('meetings.ask.send')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="meetings-ask-starters">
        {STARTERS.map((key) => (
          <button
            key={key}
            onClick={() => send(t(key))}
            disabled={ask.isPending}
            className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            {t(key)}
          </button>
        ))}
      </div>

      {answer && (
        <div className="pt-1" data-testid="meetings-ask-answer">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
          {/* An ungrounded reply is a refusal, and must not be dressed as a
              finding — the server says which it is, and this shows it. */}
          {!answer.grounded && (
            <p className="text-[11px] text-amber-600 mt-1.5">{t('meetings.ask.notGrounded')}</p>
          )}
        </div>
      )}
    </section>
  )
}
