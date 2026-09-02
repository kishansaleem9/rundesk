/**
 * §G06 [05:35–06:35] — the person profile panel.
 *
 * > "Yeh meri PROFILE hai; yeh mujhe show karti hai ke meri ACTIVITY kya hai,
 * > meri EMAIL kya hai, mera TIME ZONE kya chal raha hai, main kis ki TEAM
 * > MEMBER hoon … meri PRIORITIES kya hain … COMMENTS … CALENDAR … aur yahan
 * > mujhe ORGANIZATION CHART show ho jayega"
 *
 * A full minute on one panel. What she describes is not `/app/profile`, which
 * is an account-settings form — password, sessions, 2FA, danger zone. Same
 * word, different page, and a full-page navigation that loses your place.
 *
 * So: a panel that overlays whatever you were doing and answers *who is this
 * person and what are they working on*. It renders at every width, unlike the
 * chat page's `hidden xl:flex` member card, which simply did not exist below
 * 1280px.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Button, Input, PersonAvatar, cn, toast } from '@rundesk/ui'
import {
  X,
  Clock,
  Mail,
  Users,
  Activity as ActivityIcon,
  CalendarDays,
  Target,
  Plus,
  Check,
  Search,
  Network,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Sparkles,
  Loader2,
  Plane,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { useWorkspaceRole } from '../hooks/use-workspace-role'
import { usePersonPanel } from '../store/person-panel'
import { InlineSkeleton } from './loading-skeletons'

type Person = {
  id: string
  displayName: string
  email: string
  avatarUrl?: string | null
  bio?: string | null
  timezone?: string | null
  role?: string | null
  joinedAt?: string | null
  status?: 'online' | 'away' | 'busy' | 'offline'
  customStatus?: { emoji: string | null; text: string | null; expiresAt: string | null } | null
}

type Profile = {
  person: Person
  teams: Array<{ id: string; name: string; alias: string | null }>
  reporting: {
    manager: { id: string; displayName: string; avatarUrl?: string | null; role?: string | null } | null
    reports: Array<{ id: string; displayName: string; avatarUrl?: string | null; role?: string | null }>
  }
  assignedTasks: PersonTask[]
  /** §G05 [06:08–06:14] — the four buckets she names, plus undated work. */
  taskBuckets?: {
    today: PersonTask[]
    overdue: PersonTask[]
    next: PersonTask[]
    unscheduled: PersonTask[]
    createdUnassigned: PersonTask[]
  }
}

type PersonTask = {
  id: string
  title: string
  status: string
  priority?: string | null
  dueDate?: string | null
  listName?: string | null
}

type Priority = {
  id: string
  taskId: string | null
  title: string
  taskStatus?: string | null
  position: number
  doneAt: string | null
}

/**
 * §G06 [05:46] — "mera TIME ZONE kya chal raha hai".
 *
 * A live clock in THEIR zone, not a zone name. "Asia/Karachi" is a fact about
 * configuration; "5:28 pm" is the fact you needed, which is whether it is a
 * reasonable hour to ping them.
 */
function LocalTime({ timezone }: { timezone?: string | null }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Every 30s: a minute-resolution clock that updates on the minute would
    // sit up to 59 seconds wrong, which is exactly when somebody looks.
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!timezone) return null
  let time: string
  try {
    time = new Intl.DateTimeFormat([], { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(now)
  } catch {
    // An unrecognised zone is somebody's stored typo, not a reason to blank
    // the whole header.
    return null
  }
  return (
    <span className="inline-flex items-center gap-1" data-testid="person-local-time">
      <Clock className="h-3.5 w-3.5" />
      {t('person.localTime', { time })}
    </span>
  )
}

/** §G06 [05:54] — today's most important tasks, chosen rather than derived. */
function Priorities({ workspaceId, userId, isMe }: { workspaceId: string; userId: string; isMe: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const key = ['person-priorities', workspaceId, userId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<Priority[]>(`/workspaces/${workspaceId}/people/${userId}/priorities`),
  })
  const items = query.data ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : (err as Error).message)

  const add = useMutation({
    mutationFn: (title: string) =>
      api(`/workspaces/${workspaceId}/priorities`, { method: 'POST', body: { title } }),
    onSuccess: () => {
      setDraft('')
      invalidate()
    },
    onError,
  })
  const setDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api(`/workspaces/${workspaceId}/priorities/${id}`, { method: 'PATCH', body: { done } }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/priorities/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError,
  })
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api(`/workspaces/${workspaceId}/priorities/order`, { method: 'PUT', body: { ids } }),
    onSuccess: invalidate,
    onError,
  })

  const move = (index: number, delta: number) => {
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((p) => p.id))
  }

  if (query.isLoading) return <InlineSkeleton />

  return (
    <div className="space-y-2" data-testid="person-priorities">
      {items.length === 0 && (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          {isMe ? t('person.prioritiesEmptyMine') : t('person.prioritiesEmptyTheirs')}
        </p>
      )}
      {items.map((p, i) => (
        <div
          key={p.id}
          data-testid={`priority-${p.id}`}
          className="group flex items-start gap-2 rounded-md border border-border/70 px-2 py-1.5"
        >
          <button
            type="button"
            disabled={!isMe || setDone.isPending}
            title={p.doneAt ? t('person.priorityReopen') : t('person.priorityDone')}
            data-testid={`priority-done-${p.id}`}
            onClick={() => setDone.mutate({ id: p.id, done: !p.doneAt })}
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              p.doneAt ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border',
              !isMe && 'cursor-default opacity-60',
            )}
          >
            {p.doneAt && <Check className="h-3 w-3" />}
          </button>
          <span className={cn('flex-1 text-[13px]', p.doneAt && 'text-muted-foreground line-through')}>
            {p.title}
          </span>
          {isMe && (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {/* Arrows rather than drag: the list is short by design, and a
                  drag target this narrow is a coin toss on touch. */}
              <button
                type="button"
                title={t('person.priorityUp')}
                data-testid={`priority-up-${p.id}`}
                disabled={i === 0 || reorder.isPending}
                onClick={() => move(i, -1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t('person.priorityDown')}
                disabled={i === items.length - 1 || reorder.isPending}
                onClick={() => move(i, 1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t('person.priorityRemove')}
                onClick={() => remove.mutate(p.id)}
                className="text-muted-foreground hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      ))}

      {isMe && (
        <div className="flex gap-1.5 pt-1">
          <Input
            value={draft}
            data-testid="priority-input"
            placeholder={t('person.priorityPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault()
                add.mutate(draft.trim())
              }
            }}
            className="h-8 text-[13px]"
          />
          <Button
            size="sm"
            data-testid="priority-add"
            disabled={!draft.trim() || add.isPending}
            onClick={() => add.mutate(draft.trim())}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

/** §G06 [06:00] — what they have been doing, searchable. */
function ActivityFeed({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  // Debounced so typing does not fire a request per keystroke.
  const [applied, setApplied] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setApplied(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])

  const query = useQuery({
    queryKey: ['person-activity', workspaceId, userId, applied],
    queryFn: () =>
      api<Array<{ id: string; action: string; createdAt: string; taskId: string; taskTitle: string; listName?: string | null }>>(
        `/workspaces/${workspaceId}/people/${userId}/activity${applied ? `?q=${encodeURIComponent(applied)}` : ''}`,
      ),
  })
  const rows = query.data ?? []

  return (
    <div className="space-y-2" data-testid="person-activity">
      {/* The search icon on the frame's feed header. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          data-testid="activity-search"
          placeholder={t('person.activitySearch')}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 pl-8 text-[13px]"
        />
      </div>
      {query.isLoading ? (
        <InlineSkeleton />
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          {applied ? t('person.activityNoMatch') : t('person.activityEmpty')}
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-md border border-border/60 px-2 py-1.5">
            <div className="text-[13px] text-foreground">{row.taskTitle}</div>
            <div className="text-[11px] text-muted-foreground">
              {t(`activity.${row.action}` as never, {}) || row.action} ·{' '}
              {new Date(row.createdAt).toLocaleString()}
              {row.listName ? ` · ${row.listName}` : ''}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/** §G06 [06:22] — their next two weeks: dated tasks and meetings they are in. */
type TimeOffEntry = {
  id: string
  userId: string
  startsOn: string
  endsOn: string
  note: string | null
  displayName: string
}

/**
 * G05-8 [05:43] — "+ Add time off", the first row of the profile's Activity tab.
 *
 * Time off was fully built — schema, service, controller — and its only way in
 * was a collapsed accordion inside the Workload heat map. Nobody books leave by
 * first navigating to a capacity chart; they open the person and say "I'm out
 * next week". So the same endpoints get a second, obvious door here.
 *
 * Sits above the contact details, where her frames put it. Read-only for
 * everyone (availability is a team fact), writable for yourself and, if you
 * manage the workspace, for anyone — the same rule the server enforces, so the
 * form never offers what would come back a 403.
 */
function TimeOff({
  workspaceId,
  userId,
  isMe,
  personName,
}: {
  workspaceId: string
  userId: string
  isMe: boolean
  personName: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { isManagerOrAbove } = useWorkspaceRole(workspaceId)
  const canBook = isMe || isManagerOrAbove
  const [adding, setAdding] = useState(false)
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')

  // From today forward. Leave that ended is history; this answers "when is
  // this person away", which is only ever a question about the future.
  const from = new Date().toLocaleDateString('en-CA')

  const entriesQuery = useQuery({
    queryKey: ['time-off', workspaceId, from],
    queryFn: () => api<TimeOffEntry[]>(`/workspaces/${workspaceId}/time-off?from=${from}`),
    enabled: Boolean(workspaceId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['time-off', workspaceId] })
    qc.invalidateQueries({ queryKey: ['workload-report', workspaceId] })
  }

  const add = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/time-off`, {
        method: 'POST',
        // A single day is the common case, so an empty end date means "just
        // that day" rather than a validation error.
        body: { userId, startsOn, endsOn: endsOn || startsOn },
      }),
    onSuccess: () => {
      setStartsOn('')
      setEndsOn('')
      setAdding(false)
      toast.success(t('person.timeOffAdded'))
      invalidate()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/time-off/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  // The workspace endpoint returns everyone's; this panel is about one person.
  const mine = (entriesQuery.data ?? []).filter((e) => e.userId === userId)

  return (
    <section className="border-b border-border/60 px-4 py-3" data-testid="person-time-off">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Plane className="h-3.5 w-3.5" />
          {t('person.timeOff')}
        </h3>
        {canBook && (
          <button
            type="button"
            data-testid="person-time-off-add"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t('person.addTimeOff')}
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="person-time-off-form">
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            aria-label={t('person.timeOffFrom')}
            data-testid="person-time-off-from"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
          />
          <span className="text-[11px] text-muted-foreground/60">→</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            aria-label={t('person.timeOffTo')}
            data-testid="person-time-off-to"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
          />
          <Button
            size="sm"
            className="h-7 px-2 text-[11px]"
            data-testid="person-time-off-save"
            disabled={!startsOn || add.isPending}
            onClick={() => add.mutate()}
          >
            {t('common.save')}
          </Button>
        </div>
      )}

      {mine.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-muted-foreground" data-testid="person-time-off-empty">
          {isMe ? t('person.timeOffNoneMe') : t('person.timeOffNone', { name: personName })}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1" data-testid="person-time-off-list">
          {mine.map((entry) => (
            <li
              key={entry.id}
              data-testid={`person-time-off-${entry.id}`}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="flex-1 truncate tabular-nums text-foreground">
                {entry.startsOn === entry.endsOn
                  ? entry.startsOn
                  : `${entry.startsOn} → ${entry.endsOn}`}
              </span>
              {canBook && (
                <button
                  type="button"
                  data-testid={`person-time-off-remove-${entry.id}`}
                  aria-label={t('common.remove')}
                  onClick={() => remove.mutate(entry.id)}
                  disabled={remove.isPending}
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonCalendar({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['person-calendar', workspaceId, userId],
    queryFn: () =>
      api<{
        from: string
        to: string
        tasks: Array<{ id: string; title: string; dueDate?: string | null; startDate?: string | null }>
        meetings: Array<{ id: string; title: string; startsAt?: string | null; joinUrl?: string | null }>
      }>(`/workspaces/${workspaceId}/people/${userId}/calendar`),
  })

  if (query.isLoading) return <InlineSkeleton />
  const data = query.data
  // One list, sorted by when — a calendar that separates "tasks" from
  // "meetings" makes you merge two columns in your head to answer "what is
  // next", which is the only question it is asked.
  const entries = [
    ...(data?.tasks ?? []).map((x) => ({
      id: `t-${x.id}`,
      at: x.dueDate ?? x.startDate ?? null,
      title: x.title,
      kind: 'task' as const,
      joinUrl: null as string | null,
    })),
    ...(data?.meetings ?? []).map((x) => ({
      id: `m-${x.id}`,
      at: x.startsAt ?? null,
      title: x.title,
      kind: 'meeting' as const,
      joinUrl: x.joinUrl ?? null,
    })),
  ]
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime())

  return (
    <div className="space-y-2" data-testid="person-calendar">
      {entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">{t('person.calendarEmpty')}</p>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="flex items-start gap-2 rounded-md border border-border/60 px-2 py-1.5">
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-full',
                e.kind === 'meeting' ? 'bg-violet-500' : 'bg-amber-500',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground">{e.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(e.at!).toLocaleString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            {e.joinUrl && (
              <a
                href={e.joinUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[11px] font-medium text-accent hover:underline"
              >
                {t('person.join')}
              </a>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export function PersonPanel() {
  const { t } = useTranslation()
  const userId = usePersonPanel((s) => s.userId)
  const close = usePersonPanel((s) => s.close)
  const me = useAuthStore((s) => s.user)
  const params = useParams({ strict: false }) as { workspaceId?: string }
  const workspaceId = params.workspaceId
  const [tab, setTab] = useState<'priorities' | 'activity' | 'calendar'>('priorities')

  // Escape closes, like every other overlay in the app.
  useEffect(() => {
    if (!userId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userId, close])

  // A fresh person starts on the first tab rather than wherever the last one
  // was left, which reads as the panel remembering the wrong thing.
  useEffect(() => setTab('priorities'), [userId])

  const query = useQuery({
    queryKey: ['person-profile', workspaceId, userId],
    queryFn: () => api<Profile>(`/workspaces/${workspaceId}/people/${userId}`),
    enabled: Boolean(workspaceId && userId),
  })

  const isMe = !!me?.id && me.id === userId
  const profile = query.data
  const openPanelFor = usePersonPanel((s) => s.open)
  const navigate = useNavigate()

  /*
   * The one action the chat page's member card had that this panel needs.
   *
   * That card was `hidden xl:flex`, so below 1280px there was no way to reach
   * a colleague's profile at all — which is why this panel replaced it rather
   * than sitting beside it. Starting a DM is the thing people actually did
   * from it, so it comes along.
   */
  const startDm = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/workspaces/${workspaceId}/chat/dms`, {
        method: 'POST',
        body: { userId },
      }),
    onSuccess: (channel) => {
      close()
      navigate({
        to: '/app/$workspaceId/chat',
        params: { workspaceId: workspaceId! },
        search: { channel: channel.id } as never,
      })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  /**
   * §G05 [05:40] — "✦ Get StandUp".
   *
   * On demand rather than on open. It is the one thing on this panel that can
   * cost money to answer, and a profile you glance at forty times a day must
   * not bill for a summary nobody read — which is also why it is a button in
   * the frames rather than a section that is simply there.
   *
   * The answer is kept in local state instead of a query cache: pressing it
   * again means "tell me again, now", and a cache would hand back the same
   * paragraph and look broken.
   */
  const [standup, setStandup] = useState<{ text: string; generated: boolean } | null>(null)
  const getStandup = useMutation({
    mutationFn: () =>
      api<{ text: string; generated: boolean }>(
        `/workspaces/${workspaceId}/people/${userId}/standup`,
        { method: 'POST', body: { days: 7 } },
      ),
    onSuccess: (res) => setStandup({ text: res.text, generated: res.generated }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  })

  // A new person means a new panel, and last person's summary must not be
  // sitting under their name while the request for this one is still out.
  useEffect(() => {
    setStandup(null)
  }, [userId])

  const dotClass = useMemo(() => {
    switch (profile?.person?.status) {
      case 'online':
        return 'bg-emerald-500'
      case 'away':
        return 'bg-amber-400'
      case 'busy':
        return 'bg-rose-500'
      default:
        return 'bg-muted-foreground/40'
    }
  }, [profile?.person?.status])

  if (!userId) return null

  /*
   * Outside a workspace there is nobody to look up — the whole panel is
   * workspace-scoped. Saying so beats an empty panel that looks broken.
   */
  if (!workspaceId) {
    return (
      <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={close}>
        <aside
          className="h-full w-[460px] max-w-full bg-background p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-muted-foreground">{t('person.needWorkspace')}</p>
        </aside>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={close} data-testid="person-panel-backdrop">
      <aside
        data-testid="person-panel"
        // Full width on a phone, 460px above it — the chat page's member card
        // was `hidden xl:flex`, so it did not exist for anybody on a laptop
        // under 1280px, which is most people.
        className="flex h-full w-[460px] max-w-full flex-col bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border/70 p-4">
          <div className="flex min-w-0 gap-3">
            <div className="relative shrink-0">
              <PersonAvatar
                name={profile?.person?.displayName ?? ''}
                imageUrl={profile?.person?.avatarUrl}
                size="lg"
              />
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                  dotClass,
                )}
              />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-foreground" data-testid="person-name">
                {profile?.person?.displayName ?? <InlineSkeleton />}
              </h2>
              {/* §G06 [06:42] — the sentence, where a teammate will look. */}
              {profile?.person?.customStatus && (
                <p className="truncate text-[13px] text-muted-foreground" data-testid="person-status">
                  {profile.person.customStatus.emoji} {profile.person.customStatus.text}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {profile?.person?.email && (
                  <a
                    href={`mailto:${profile.person.email}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    data-testid="person-email"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {profile.person.email}
                  </a>
                )}
                <LocalTime timezone={profile?.person?.timezone} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* §G05 [05:40] — beside the message button, as the frames show.
                Offered for yourself too: "what have I actually been doing this
                week" is a question people ask before a standup, not only
                about somebody else. */}
            <button
              type="button"
              data-testid="person-standup"
              title={t('person.getStandup')}
              aria-label={t('person.getStandup')}
              disabled={getStandup.isPending}
              onClick={() => getStandup.mutate()}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {getStandup.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t('person.getStandup')}
            </button>
            {!isMe && (
              <button
                type="button"
                data-testid="person-message"
                title={t('person.message')}
                aria-label={t('person.message')}
                disabled={startDm.isPending}
                onClick={() => startDm.mutate()}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              data-testid="person-panel-close"
              aria-label={t('common.cancel')}
              onClick={close}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/*
            §G05 [05:40] — the standup, once it has been asked for.
            First in the body rather than at the bottom: it is what the button
            just above it produced, and a summary that appears below three
            other sections reads as though nothing happened.
          */}
          {standup && (
            <section className="border-b border-border/60 bg-muted/30 px-4 py-3" data-testid="person-standup-result">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t('person.standup')}
              </h3>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">{standup.text}</p>
              {/*
                Said rather than hidden. Without a model this is assembled from
                the task rows directly, and a reader who assumes every summary
                on the page came from one would trust a sentence differently
                than they should.
              */}
              {!standup.generated && (
                <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="person-standup-plain">
                  {t('person.standupNoModel')}
                </p>
              )}
            </section>
          )}
          {/*
            G05-8 [05:43] — first in the body, as her frames place it: above the
            teams and the reporting line, because "are they even here this week"
            is the question that changes what you do next.
          */}
          {workspaceId && userId && (
            <TimeOff
              workspaceId={workspaceId}
              userId={userId}
              isMe={isMe}
              personName={profile?.person?.displayName ?? ''}
            />
          )}
          {/* §G06 [05:43] — "main kis ki TEAM MEMBER hoon". */}
          {!!profile?.teams?.length && (
            <section className="border-b border-border/60 px-4 py-3">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {t('person.teams')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.teams.map((team) => (
                  <span
                    key={team.id}
                    data-testid={`person-team-${team.id}`}
                    className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {team.alias ? `@${team.alias}` : team.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/*
            §G06 [06:28] — "yahan mujhe ORGANIZATION CHART show ho jayega".
            One person's reporting line, not the whole tree: who they report to
            and who reports to them. "No manager" is rendered as a fact — it is
            an answer, and a blank space is not.
          */}
          <section className="border-b border-border/60 px-4 py-3" data-testid="person-reporting">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Network className="h-3.5 w-3.5" />
              {t('person.reportingLine')}
            </h3>
            {profile?.reporting?.manager ? (
              <button
                type="button"
                data-testid="person-manager"
                onClick={() => openPanelFor(profile.reporting.manager!.id)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50"
              >
                <PersonAvatar
                  name={profile.reporting.manager.displayName}
                  imageUrl={profile.reporting.manager.avatarUrl}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {profile.reporting.manager.displayName}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('person.manager')}
                </span>
              </button>
            ) : (
              <p className="px-1.5 text-[12px] text-muted-foreground" data-testid="person-no-manager">
                {t('person.noManager')}
              </p>
            )}
            {!!profile?.reporting?.reports?.length && (
              <div className="mt-2 space-y-0.5 border-l border-border/70 pl-3">
                {profile.reporting.reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    data-testid={`person-report-${r.id}`}
                    onClick={() => openPanelFor(r.id)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/50"
                  >
                    <PersonAvatar name={r.displayName} imageUrl={r.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{r.displayName}</span>
                  </button>
                ))}
                <p className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                  {t('person.reportCount', { n: profile.reporting.reports.length })}
                </p>
              </div>
            )}
          </section>

          <div className="flex gap-1 border-b border-border/60 px-3">
            {(
              [
                ['priorities', Target, 'person.tabPriorities'],
                ['activity', ActivityIcon, 'person.tabActivity'],
                ['calendar', CalendarDays, 'person.tabCalendar'],
              ] as const
            ).map(([key, Icon, labelKey]) => (
              <button
                key={key}
                type="button"
                data-testid={`person-tab-${key}`}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-2 py-2 text-[12px] transition-colors',
                  tab === key
                    ? 'border-accent text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === 'priorities' && <Priorities workspaceId={workspaceId} userId={userId} isMe={isMe} />}
            {tab === 'activity' && <ActivityFeed workspaceId={workspaceId} userId={userId} />}
            {tab === 'calendar' && <PersonCalendar workspaceId={workspaceId} userId={userId} />}
          </div>

          {/*
            §G05 [06:08–06:14] — "TODAY ke kya task hain, OVERDUE kaun se ho gaye
            the, NEXT kaun se upcoming task mere paas aa sakte hain, kaun si
            aisi cheezein jo maine CREATE ki hain par abhi tak maine kisi ko
            assign nahi kiya."

            This was one flat "Working on" list, which answers none of those
            four questions. An empty bucket is left out rather than shown empty:
            five headings over nothing is worse than the list it replaced.
          */}
          {(
            [
              ['today', 'person.bucketToday'],
              ['overdue', 'person.bucketOverdue'],
              ['next', 'person.bucketNext'],
              ['unscheduled', 'person.bucketUnscheduled'],
              ['createdUnassigned', 'person.bucketCreatedUnassigned'],
            ] as const
          ).map(([key, labelKey]) => {
            const rows = profile?.taskBuckets?.[key] ?? []
            if (!rows.length) return null
            return (
              <section key={key} className="border-t border-border/60 px-4 py-3" data-testid={`person-bucket-${key}`}>
                <h3 className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(labelKey)}
                  <span className="text-[10px] font-normal opacity-70">{rows.length}</span>
                </h3>
                <div className="space-y-1">
                  {rows.slice(0, 8).map((task) => (
                    <div key={task.id} className="flex items-baseline gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      {task.dueDate && (
                        <span
                          className={cn(
                            'shrink-0 text-[11px]',
                            key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {/* Nothing bucketed at all — an older API, or a person with no work.
              The flat list is what this panel showed before, so it stays as the
              fallback rather than the section disappearing entirely. */}
          {!profile?.taskBuckets && !!profile?.assignedTasks?.length && (
            <section className="border-t border-border/60 px-4 py-3">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('person.workingOn')}
              </h3>
              <div className="space-y-1">
                {profile.assignedTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="flex items-baseline gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.dueDate && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
