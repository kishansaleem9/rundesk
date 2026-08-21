import { useNavigate, useParams, useSearch, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import {
  Bell,
  AtSign,
  MessageSquare,
  UserPlus,
  RefreshCw,
  Ban,
  CheckCircle2,
  FileText,
  Clock,
  BarChart3,
  CreditCard,
  Archive,
  ArchiveRestore,
  Clock4,
  Settings,
  Undo2,
} from 'lucide-react'
import { formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns'
import { api } from '../lib/api'
import { resolveNotificationDestination, goToDestination } from '../lib/notification-nav'
import { MentionText } from '../components/mention-text'
import { useMentionNames } from '../hooks/use-mention-names'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type Notification = {
  id: string
  type:
    | 'task_assigned'
    | 'task_mentioned'
    | 'task_commented'
    | 'task_due_soon'
    | 'task_overdue'
    | 'task_status_changed'
    | 'task_updated'
    | 'task_blocked'
    | 'chat_message'
    | 'doc_mentioned'
    | 'doc_commented'
    | string
  title: string
  body?: string | null
  readAt?: string | null
  dismissedAt?: string | null
  snoozedUntil?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
  target?: { url?: string; entityType?: string; entityId?: string } | null
}

type TriageCounts = { inbox: number; later: number; cleared: number; unread: number }

/** The three buckets the API partitions on (§A2.6a). */
const VIEWS = ['inbox', 'later', 'cleared'] as const
export type InboxView = (typeof VIEWS)[number]

const VIEW_LABEL_KEY: Record<InboxView, TranslationKey> = {
  inbox: 'inbox.tabInbox',
  later: 'inbox.tabLater',
  cleared: 'inbox.tabCleared',
}

/** Snooze presets offered on a row, in hours. */
const SNOOZE_PRESETS: Array<{ hours: number; labelKey: TranslationKey }> = [
  { hours: 1, labelKey: 'inbox.snooze1h' },
  { hours: 4, labelKey: 'inbox.snooze4h' },
  { hours: 24, labelKey: 'inbox.snoozeTomorrow' },
  { hours: 24 * 7, labelKey: 'inbox.snoozeNextWeek' },
]

// Notification-type → display metadata. `labelKey` is a translation key resolved
// at render; the raw type id stays the data key. Unknown types fall back to a
// humanized version of the id (see humanizeType).
const TYPE_META: Record<string, { icon: React.ElementType; color: string; labelKey: TranslationKey }> = {
  task_mentioned: { icon: AtSign, color: 'text-accent', labelKey: 'inbox.type.mentioned' },
  task_commented: { icon: MessageSquare, color: 'text-blue-500', labelKey: 'inbox.type.commented' },
  doc_mentioned: { icon: AtSign, color: 'text-accent', labelKey: 'inbox.type.mentioned' },
  doc_commented: { icon: MessageSquare, color: 'text-blue-500', labelKey: 'inbox.type.commented' },
  task_assigned: { icon: UserPlus, color: 'text-emerald-500', labelKey: 'inbox.type.assigned' },
  task_due_soon: { icon: Bell, color: 'text-amber-500', labelKey: 'inbox.type.dueSoon' },
  task_overdue: { icon: Bell, color: 'text-red-500', labelKey: 'inbox.type.overdue' },
  chat_message: { icon: MessageSquare, color: 'text-indigo-500', labelKey: 'inbox.type.newMessage' },
  task_status_changed: { icon: RefreshCw, color: 'text-cyan-500', labelKey: 'inbox.type.statusChanged' },
  task_updated: { icon: RefreshCw, color: 'text-cyan-500', labelKey: 'inbox.type.taskUpdated' },
  task_blocked: { icon: Ban, color: 'text-red-500', labelKey: 'inbox.type.blocked' },
  test_notification: { icon: Bell, color: 'text-muted-foreground', labelKey: 'inbox.type.test' },
}

/**
 * §A2.7 — where a notification came from, read off the deep-link target the row
 * has always carried. Only the kind of thing is knowable here (the target stores
 * an id, not a name), which is still the difference between "a comment" and
 * "a comment on a doc".
 */
const SOURCE_META: Record<string, { icon: React.ElementType; labelKey: TranslationKey }> = {
  task: { icon: CheckCircle2, labelKey: 'inbox.source.task' },
  doc: { icon: FileText, labelKey: 'inbox.source.doc' },
  chat_message: { icon: MessageSquare, labelKey: 'inbox.source.channel' },
  timesheet: { icon: Clock, labelKey: 'inbox.source.timesheet' },
  insights: { icon: BarChart3, labelKey: 'inbox.source.insights' },
  workload: { icon: BarChart3, labelKey: 'inbox.source.insights' },
  billing: { icon: CreditCard, labelKey: 'inbox.source.billing' },
}

/**
 * §A2.11 — why this landed in your inbox. Every branch mirrors a real dispatch
 * rule in the API (watchers for task updates, assignees for due reminders,
 * channel membership for chat), so the line is an explanation, not a guess.
 */
function followReasonKey(notif: Notification): TranslationKey | null {
  const isChat = notif.target?.entityType === 'chat_message'
  switch (notif.type) {
    case 'task_mentioned':
    case 'doc_mentioned':
      return isChat ? 'inbox.why.mentionedChannel' : 'inbox.why.mentioned'
    case 'chat_message':
      return 'inbox.why.channelMember'
    case 'task_assigned':
      return 'inbox.why.assigned'
    case 'task_due_soon':
    case 'task_overdue':
      return 'inbox.why.assignedDue'
    case 'task_commented':
    case 'task_status_changed':
    case 'task_updated':
      return 'inbox.why.watching'
    // notifyTaskBlocked targets assignees ∪ watchers, so "watching" alone would
    // be wrong for the assignee half.
    case 'task_blocked':
      return 'inbox.why.assignedOrWatching'
    case 'doc_commented':
      return 'inbox.why.docThread'
    case 'approval_needed':
      return 'inbox.why.approver'
    // Addressed to you personally rather than through a subscription.
    case 'ai_briefing':
    case 'workload_alert':
    case 'test_notification':
      return 'inbox.why.directToYou'
    case 'billing_past_due':
      return 'inbox.why.workspaceAdmin'
    default:
      // An unmapped type still deserves a line — silence reads as a bug, and
      // every notification reaches you for *some* reason.
      return 'inbox.why.subscribed'
  }
}

/** Humanize an unknown notification-type id (e.g. `task_foo` → `Task foo`) for display. */
function humanizeType(type: string): string {
  const spaced = type.replace(/[_-]+/g, ' ').trim()
  if (!spaced) return type
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Comment/mention notification types the backend actually emits (see
// apps/api notifications.service.ts NotificationType). Resolve only makes
// sense for these.
const COMMENT_OR_MENTION_TYPES = new Set([
  'task_mentioned',
  'task_commented',
  'doc_mentioned',
  'doc_commented',
])

function isCommentOrMention(type: string): boolean {
  return COMMENT_OR_MENTION_TYPES.has(type)
}

// §A2.6b — human-authored traffic, as opposed to the machine-generated alerts
// (due dates, status transitions, briefings). A derived predicate over data the
// client already holds; no classification column needed.
/**
 * §2.5 — how long a cleared notification is kept, mirroring
 * NotificationRetentionService.RETENTION_DAYS on the server.
 *
 * > "jaise hi aap ne clear kar diya, 30 days tak rahega aur delete ho jayega.
 * >  TRASH ka bhi yehi scene hai."
 *
 * She described this in detail, and the Cleared tab said nothing about it: rows
 * were dated by when the notification arrived, so something cleared today could
 * sit under a "200 days ago" heading with no hint it expires at all.
 */
const RETENTION_DAYS = 30

/** Days left before a cleared row is deleted, or null if it is not cleared. */
function daysUntilDeleted(dismissedAt: string | null | undefined): number | null {
  if (!dismissedAt) return null
  const cleared = new Date(dismissedAt).getTime()
  if (Number.isNaN(cleared)) return null
  const elapsedDays = (Date.now() - cleared) / (24 * 60 * 60 * 1000)
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsedDays))
}

const HUMAN_TYPES = new Set([
  'task_mentioned',
  'doc_mentioned',
  'task_commented',
  'doc_commented',
  'task_assigned',
  'chat_message',
])

/**
 * Primary is what a person sent you — a mention, a comment, an assignment, a
 * message. Everything else is what the system sent you: due-date reminders,
 * status transitions, briefings, billing. The distinction that matters at 200
 * notifications is not what kind of object it was about, it is whether someone
 * is waiting on you.
 *
 * §2.2 — there was a third chip, Other, holding the complement. She asked for
 * it to go: "yeh mujhe NAHI CHAHIYE humari list mein, kyunke yahan bhi same
 * 'All' wale hi hain". Nothing is hidden by dropping it — system notifications
 * were always in All as well, so Other only ever offered a second route to the
 * same rows. An earlier audit of ours argued for keeping the split; hers is the
 * call that counts.
 */
export type InboxFilter = 'all' | 'primary'

export function matchesInboxFilter(type: string, filter: InboxFilter): boolean {
  if (filter === 'all') return true
  return HUMAN_TYPES.has(type)
}

const FILTER_LABEL_KEY: Record<InboxFilter, TranslationKey> = {
  all: 'inbox.filterAll',
  primary: 'inbox.filterPrimary',
}
const FILTER_HINT_KEY: Record<InboxFilter, TranslationKey> = {
  all: 'inbox.filterAllHint',
  primary: 'inbox.filterPrimaryHint',
}

/** A run of notifications about the same thing, rendered as one row (§A2.7). */
type NotificationGroup = {
  key: string
  latest: Notification
  items: Notification[]
}

/**
 * Collapse repeats about the same target into one row, newest first. Five
 * comments on one task is one thing that happened, not five inbox entries.
 */
function groupNotifications(notifs: Notification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = []
  const byKey = new Map<string, NotificationGroup>()
  for (const n of notifs) {
    const entityId = n.target?.entityId
    const key = entityId ? `${n.type}:${n.target?.entityType ?? ''}:${entityId}` : `single:${n.id}`
    const existing = byKey.get(key)
    if (existing) {
      existing.items.push(n)
      continue
    }
    const group: NotificationGroup = { key, latest: n, items: [n] }
    byKey.set(key, group)
    groups.push(group)
  }
  return groups
}

/** Day bucket for the Today / Yesterday / date headers (§A2.7). */
function dayBucket(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'today'
  if (isYesterday(d)) return 'yesterday'
  return d.toDateString()
}

export function InboxPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/inbox' })
  const { view = 'inbox', filter = 'all' } = useSearch({ from: '/app/$workspaceId/inbox' })

  const notifsQuery = useQuery({
    queryKey: ['notifications', workspaceId, view],
    queryFn: async () => {
      try {
        return await api<Notification[]>(`/notifications?view=${view}`)
      } catch {
        return [] as Notification[]
      }
    },
  })
  const countsQuery = useQuery({
    queryKey: ['notification-counts'],
    queryFn: async () => {
      try {
        return await api<TriageCounts>('/notifications/counts')
      } catch {
        return { inbox: 0, later: 0, cleared: 0, unread: 0 } as TriageCounts
      }
    },
  })

  const { namesById } = useMentionNames(workspaceId)
  const counts = countsQuery.data ?? { inbox: 0, later: 0, cleared: 0, unread: 0 }
  const all = notifsQuery.data ?? []
  const notifs = all.filter((n) => matchesInboxFilter(n.type, filter))
  const unread = notifs.filter((n) => !n.readAt)
  // Counts per chip, so the split tells you where the traffic is before you
  // click into it. Derived from the list already loaded — no extra request.
  const primaryCount = all.filter((n) => matchesInboxFilter(n.type, 'primary')).length
  const filterCounts: Record<InboxFilter, number> = {
    all: all.length,
    primary: primaryCount,
  }

  // Every triage verb moves rows between buckets, so the tab counts and the
  // bell badge have to be refetched alongside the list itself.
  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ['notifications'] })
    await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    await qc.invalidateQueries({ queryKey: ['notification-counts'] })
  }

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refreshAll,
  })
  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: refreshAll,
  })
  const clear = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api(`/notifications/${id}/clear`, { method: 'POST' }))),
    onSuccess: refreshAll,
  })
  // §2.5 — "mere paas jitne bhi notifications hain main yahan se clear kar
  // sakti hoon. Maine sab clear kiye." Clearing was per-row only.
  const clearAll = useMutation({
    mutationFn: () =>
      api('/notifications/clear-all', {
        method: 'POST',
        // Only what the chip is showing. Clearing while filtered to Primary
        // must not also bin what the filter was hiding.
        body: filter === 'primary' ? { types: [...HUMAN_TYPES] } : {},
      }),
    onSuccess: refreshAll,
  })

  const unclear = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api(`/notifications/${id}/unclear`, { method: 'POST' }))),
    onSuccess: refreshAll,
  })
  const snooze = useMutation({
    mutationFn: ({ ids, hours }: { ids: string[]; hours: number }) =>
      Promise.all(ids.map((id) => api(`/notifications/${id}/snooze`, { method: 'POST', body: { hours } }))),
    onSuccess: refreshAll,
  })
  const unsnooze = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api(`/notifications/${id}/unsnooze`, { method: 'POST' }))),
    onSuccess: refreshAll,
  })

  // Navigate to a resolved path, splitting any query string into `search` so
  // deep-links like /app/:ws/chat?channel=..&message=.. actually carry params.
  const go = (dest: string) => goToDestination(navigate, dest)

  const setSearch = (next: { view?: InboxView; filter?: InboxFilter }) =>
    navigate({ to: '/app/$workspaceId/inbox', params: { workspaceId }, search: { view, filter, ...next } })

  const groups = groupNotifications(notifs)
  const buckets: Array<{ bucket: string; groups: NotificationGroup[] }> = []
  for (const group of groups) {
    const bucket = dayBucket(
      view === 'cleared' ? (group.latest.dismissedAt ?? group.latest.createdAt) : group.latest.createdAt,
    )
    const last = buckets[buckets.length - 1]
    if (last && last.bucket === bucket) last.groups.push(group)
    else buckets.push({ bucket, groups: [group] })
  }

  const bucketLabel = (bucket: string) =>
    bucket === 'today' ? t('inbox.today') : bucket === 'yesterday' ? t('inbox.yesterday') : bucket

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('nav.inbox')}</div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('inbox.title')}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {counts.unread > 0 && (
              <>
                <Badge variant="gradient" className="text-[10px]">
                  {t('inbox.new', { count: counts.unread })}
                </Badge>
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                >
                  {t('topbar.markAllRead')}
                </button>
                {view === 'inbox' && notifs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                    data-testid="inbox-clear-all"
                    className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                  >
                    {t('inbox.clearAll')}
                  </button>
                )}
              </>
            )}
            {/* §A2.11 — delivery preferences were reachable only from the
                profile page, so "why am I getting this?" had no answer here. */}
            <Link
              to="/app/profile"
              search={{ tab: 'notifications' }}
              aria-label={t('inbox.deliverySettings')}
              title={t('inbox.deliverySettings')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
          {/* §2.5 — clearing is not archiving: the server deletes cleared rows
              after 30 days. Say so where the cleared ones are, rather than
              letting people discover it by missing something. */}
          {view === 'cleared' ? t('inbox.clearedRetentionNote') : t('inbox.subtitle')}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSearch({ view: v })}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  view === v
                    ? 'bg-accent/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {t(VIEW_LABEL_KEY[v])}
                <span className="tabular-nums text-[10px] text-muted-foreground">{counts[v]}</span>
              </button>
            ))}
          </div>
          {/* §A2.6b — a derived filter, not extra tabs: Primary is what a
              person sent you; All is everything. */}
          <div className="flex items-center gap-1 border-l border-border/50 pl-3">
            {(['all', 'primary'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSearch({ filter: f })}
                title={t(FILTER_HINT_KEY[f])}
                aria-pressed={filter === f}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors',
                  filter === f
                    ? 'border-brand-500 bg-brand-500/10 text-foreground'
                    : 'border-border/70 text-muted-foreground hover:bg-accent/10 hover:text-foreground',
                )}
              >
                {t(FILTER_LABEL_KEY[f])}
                <span className="tabular-nums text-[10px] text-muted-foreground">{filterCounts[f]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {notifsQuery.isPending ? (
            // Until the request lands, `notifs` is [] — and rendering the empty
            // state here would assert there is nothing in your inbox before we
            // know that. Skeleton rows say "still looking" instead.
            <ListSkeleton rows={7} rowClassName="h-14" />
          ) : notifs.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title={
                view === 'later'
                  ? t('inbox.emptyLaterTitle')
                  : view === 'cleared'
                    ? t('inbox.emptyClearedTitle')
                    : t('inbox.emptyTitle')
              }
              description={
                view === 'later'
                  ? t('inbox.emptyLaterDesc')
                  : view === 'cleared'
                    ? t('inbox.emptyClearedDesc')
                    : t('inbox.emptyDesc')
              }
            />
          ) : (
            buckets.map(({ bucket, groups: bucketGroups }) => (
              <section key={bucket}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {bucketLabel(bucket)}
                </h2>
                <div className="space-y-1">
                  {bucketGroups.map((group) => {
                    const ids = group.items.map((n) => n.id)
                    const unreadIds = group.items.filter((n) => !n.readAt).map((n) => n.id)
                    return (
                      <NotificationRow
                        key={group.key}
                        group={group}
                        namesById={namesById}
                        view={view}
                        onOpen={async () => {
                          await Promise.all(unreadIds.map((id) => markRead.mutateAsync(id)))
                          const destination = await resolveNotificationDestination(group.latest.target, workspaceId)
                          if (destination) go(destination)
                        }}
                        onResolve={
                          isCommentOrMention(group.latest.type) && unreadIds.length > 0
                            ? async () => {
                                await Promise.all(unreadIds.map((id) => markRead.mutateAsync(id)))
                              }
                            : undefined
                        }
                        onClear={() => clear.mutate(ids)}
                        onUnclear={() => unclear.mutate(ids)}
                        onSnooze={(hours) => snooze.mutate({ ids, hours })}
                        onUnsnooze={() => unsnooze.mutate(ids)}
                      />
                    )
                  })}
                </div>
              </section>
            ))
          )}
          {unread.length === 0 && notifs.length > 0 && view === 'inbox' && (
            <p className="text-center text-xs text-muted-foreground">{t('inbox.allCaughtUp')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationRow({
  group,
  namesById,
  view,
  onOpen,
  onResolve,
  onClear,
  onUnclear,
  onSnooze,
  onUnsnooze,
}: {
  group: NotificationGroup
  namesById: Record<string, string>
  view: InboxView
  onOpen?: () => void | Promise<void>
  onResolve?: () => void | Promise<void>
  onClear: () => void
  onUnclear: () => void
  onSnooze: (hours: number) => void
  onUnsnooze: () => void
}) {
  const { t } = useTranslation()
  const notif = group.latest
  const unread = group.items.some((n) => !n.readAt)
  const meta = TYPE_META[notif.type]
  const Icon = meta?.icon ?? Bell
  const iconColor = meta?.color ?? 'text-muted-foreground'
  const label = meta ? t(meta.labelKey) : humanizeType(notif.type)
  const source = notif.target?.entityType ? SOURCE_META[notif.target.entityType] : undefined
  const SourceIcon = source?.icon
  const reasonKey = followReasonKey(notif)

  // Stop a row action from also opening the notification underneath it.
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  return (
    <Card
      variant="glass"
      onClick={() => void onOpen?.()}
      className={cn(
        'group p-3 flex items-start gap-3 hover:border-accent/30 transition-all cursor-pointer',
        unread && 'border-l-2 border-l-accent bg-accent/5',
      )}
    >
      {notif.actor?.displayName ? (
        <PersonAvatar name={notif.actor.displayName} size="sm" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <Icon className={cn('h-3.5 w-3.5', iconColor)} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {notif.actor?.displayName && (
            <span className="font-medium text-sm">{notif.actor.displayName}</span>
          )}
          <Badge variant="soft" className="text-[10px]">
            <Icon className={cn('h-3 w-3', iconColor)} />
            {label}
          </Badge>
          {source && SourceIcon && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <SourceIcon className="h-3 w-3" />
              {t(source.labelKey)}
            </span>
          )}
          {group.items.length > 1 && (
            <Badge variant="soft" className="text-[10px] tabular-nums">
              {t('inbox.groupCount', { count: group.items.length })}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground ml-auto tabular-nums shrink-0">
            {/* §2.5 — on the Cleared tab the useful date is when you cleared it,
                not when it arrived, because that is what the 30 days runs from. */}
            {view === 'cleared' && notif.dismissedAt
              ? t('inbox.clearedAgo', {
                  when: formatDistanceToNowStrict(new Date(notif.dismissedAt), {
                    addSuffix: true,
                  }),
                })
              : formatDistanceToNowStrict(new Date(notif.createdAt), { addSuffix: true })}
          </span>
          {view === 'cleared' && daysUntilDeleted(notif.dismissedAt) !== null && (
            <span
              className="text-[10px] text-muted-foreground/80 tabular-nums shrink-0"
              data-testid="retention-countdown"
            >
              {t('inbox.deletedInDays', { count: daysUntilDeleted(notif.dismissedAt)! })}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground mt-1 truncate">{notif.title}</div>
        {notif.body && (
          <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            <MentionText text={notif.body} namesById={namesById} className="line-clamp-2" />
          </div>
        )}
        {notif.snoozedUntil && view === 'later' && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('inbox.snoozedUntil', { when: new Date(notif.snoozedUntil).toLocaleString() })}
          </div>
        )}
        {reasonKey && <div className="text-[11px] text-muted-foreground/80 mt-1">{t(reasonKey)}</div>}

        {/* Action cluster: quiet until hover or keyboard focus, as in ClickUp. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onResolve && (
            <RowAction onClick={act(() => void onResolve())}>{t('inbox.resolve')}</RowAction>
          )}
          {view === 'cleared' ? (
            <RowAction onClick={act(onUnclear)} icon={ArchiveRestore}>
              {t('inbox.unclear')}
            </RowAction>
          ) : (
            <RowAction onClick={act(onClear)} icon={Archive}>
              {t('inbox.clear')}
            </RowAction>
          )}
          {view === 'later' ? (
            <RowAction onClick={act(onUnsnooze)} icon={Undo2}>
              {t('inbox.unsnooze')}
            </RowAction>
          ) : (
            <details
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              <summary className="list-none inline-flex h-7 cursor-pointer select-none items-center gap-1 rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                <Clock4 className="h-3 w-3" />
                {t('inbox.snooze')}
              </summary>
              <div className="absolute z-20 mt-1 w-40 rounded-md border border-border bg-card p-1 shadow-lg">
                {SNOOZE_PRESETS.map((preset) => (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={act(() => onSnooze(preset.hours))}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </Card>
  )
}

function RowAction({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: (e: React.MouseEvent) => void
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  )
}
