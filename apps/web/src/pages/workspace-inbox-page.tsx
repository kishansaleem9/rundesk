import { useState } from 'react'
import { useNavigate, useParams, useSearch, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import {
  Bell,
  AtSign,
  MessageSquare,
  MessageCircleReply,
  UserPlus,
  RefreshCw,
  Ban,
  CheckCircle2,
  FileText,
  Clock,
  BarChart3,
  CreditCard,
  Archive,
  ArrowUpRight,
  ArchiveRestore,
  MailOpen,
  Clock4,
  Settings,
  Undo2,
  UserMinus,
  Users,
  SmilePlus,
  Share2,
  KeyRound,
  MessageSquarePlus,
  CheckCheck,
  ListPlus,
  Video,
} from 'lucide-react'
import { formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns'
import { api } from '../lib/api'
import { notificationsUrl, typesKey, useNotificationPages } from '../lib/notifications-query'
import { LoadOlder } from '../components/load-older'
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

/** §2.2 — a starred chat message, shown in Later alongside snoozed rows. */
type SavedMessage = {
  id: string
  channelId: string
  channelName: string | null
  body: string | null
  authorName: string | null
  createdAt: string
  savedAt: string
}

/**
 * §V2-S06 frame `05:55` — a task comment saved for later.
 *
 * `url` is built by the API, comment anchor included, because the path a task
 * lives at needs the space and project ids the Inbox has no other reason to
 * know. Sending the resolved link is one fact in one place; sending five ids
 * and reassembling them here would be a second copy of the URL shape.
 */
type SavedComment = {
  id: string
  body: string
  taskId: string
  taskTitle: string
  authorName: string | null
  createdAt: string
  savedAt: string
  url: string
}

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
  chat_reply: { icon: MessageCircleReply, color: 'text-indigo-400', labelKey: 'inbox.type.reply' },
  task_status_changed: { icon: RefreshCw, color: 'text-cyan-500', labelKey: 'inbox.type.statusChanged' },
  task_updated: { icon: RefreshCw, color: 'text-cyan-500', labelKey: 'inbox.type.taskUpdated' },
  task_blocked: { icon: Ban, color: 'text-red-500', labelKey: 'inbox.type.blocked' },
  test_notification: { icon: Bell, color: 'text-muted-foreground', labelKey: 'inbox.type.test' },
  // §2.2 — the kinds she went through in the customiser.
  task_unassigned: { icon: UserMinus, color: 'text-orange-500', labelKey: 'inbox.type.unassigned' },
  task_follower_changed: { icon: Users, color: 'text-sky-500', labelKey: 'inbox.type.followerChanged' },
  message_reaction: { icon: SmilePlus, color: 'text-pink-500', labelKey: 'inbox.type.reaction' },
  shared_with_me: { icon: Share2, color: 'text-violet-500', labelKey: 'inbox.type.sharedWithMe' },
  access_requested: { icon: KeyRound, color: 'text-amber-600', labelKey: 'inbox.type.accessRequested' },
  // §2.8 [19:25] — a SyncUp starting in a channel you are in.
  call_started: { icon: Video, color: 'text-violet-500', labelKey: 'inbox.type.callStarted' },
  // G10-10 [12:21–12:24] — comments, told apart. Both of these used to arrive
  // wearing another kind's icon and label: an assigned comment looked exactly
  // like being given a task, and a resolved one exactly like a new comment.
  comment_assigned: { icon: MessageSquarePlus, color: 'text-emerald-500', labelKey: 'inbox.type.commentAssigned' },
  comment_resolved: { icon: CheckCheck, color: 'text-muted-foreground', labelKey: 'inbox.type.commentResolved' },
  // G10-11 [12:38–12:41] — a subtask appeared under a task you are on.
  subtask_created: { icon: ListPlus, color: 'text-sky-500', labelKey: 'inbox.type.subtaskCreated' },
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
  // §2.8 — a person started a call. Mirrors DEFAULT_PRIMARY_TYPES on the
  // server; the two must agree or the counts differ from the list.
  'call_started',
  'task_mentioned',
  'doc_mentioned',
  'task_commented',
  'doc_commented',
  'task_assigned',
  'chat_message',
  // §2.2 — she asked for these three by name. Mirrors DEFAULT_PRIMARY_TYPES on
  // the server; the two must agree or the counts differ from the list.
  'task_unassigned',
  'task_follower_changed',
  'access_requested',
  // G10-10 — an assigned comment is somebody asking you to act, so it defaults
  // on with the rest of that family. comment_resolved and subtask_created are
  // offered and off: the "Not Important" half of her panel.
  'comment_assigned',
])

/**
 * §2.2 — Primary is what *you* said you want here.
 *
 * > "Primary pe yeh setting ka option hai; is par main click karti hoon to yeh
 * >  mujh se poochta hai ke mujhe kya cheezein show karwani hain … Phir aap ko
 * >  Primary mein sirf wohi notifications show honge jo aap chahte hain."
 *
 * It used to be the hardcoded HUMAN_TYPES set above, which is a reasonable
 * default and not what she asked for — she spent a minute on the customiser and
 * named ten kinds she would turn on or off. HUMAN_TYPES is now only the
 * starting point; the chosen set lives in notification preferences.
 *
 * There was also a third chip, Other, holding the complement. She asked for it
 * to go: "yeh mujhe NAHI CHAHIYE humari list mein, kyunke yahan bhi same 'All'
 * wale hi hain" — nothing is hidden by dropping it, since system notifications
 * were always in All too.
 */
export type InboxFilter = 'all' | 'primary'

/** Every type the customiser offers, in the order it shows them. */
export const PRIMARY_SELECTABLE_TYPES: Array<{ type: string; labelKey: TranslationKey }> = [
  { type: 'call_started', labelKey: 'inbox.type.callStarted' },
  { type: 'task_mentioned', labelKey: 'inbox.type.mentioned' },
  { type: 'doc_mentioned', labelKey: 'inbox.type.mentioned' },
  { type: 'task_commented', labelKey: 'inbox.type.commented' },
  { type: 'doc_commented', labelKey: 'inbox.type.commented' },
  { type: 'task_assigned', labelKey: 'inbox.type.assigned' },
  { type: 'chat_message', labelKey: 'inbox.type.newMessage' },
  { type: 'chat_reply', labelKey: 'inbox.type.reply' },
  { type: 'task_due_soon', labelKey: 'inbox.type.dueSoon' },
  { type: 'task_overdue', labelKey: 'inbox.type.overdue' },
  { type: 'task_status_changed', labelKey: 'inbox.type.statusChanged' },
  { type: 'task_updated', labelKey: 'inbox.type.taskUpdated' },
  { type: 'task_blocked', labelKey: 'inbox.type.blocked' },
  { type: 'task_unassigned', labelKey: 'inbox.type.unassigned' },
  { type: 'task_follower_changed', labelKey: 'inbox.type.followerChanged' },
  { type: 'access_requested', labelKey: 'inbox.type.accessRequested' },
  // Offered and off by default, because she said so: "Ab neeche se REACTIONS
  // mujhe na show hon, [shared with] mujhe na show ho."
  { type: 'message_reaction', labelKey: 'inbox.type.reaction' },
  { type: 'shared_with_me', labelKey: 'inbox.type.sharedWithMe' },
  // G10-10 / G10-11 — the rows she lists separately. Placed next to the
  // comment kinds they split off from, so the difference is legible where it
  // matters; comment_resolved and subtask_created sit in the off-by-default
  // tail with reactions and shares.
  { type: 'comment_assigned', labelKey: 'inbox.type.commentAssigned' },
  { type: 'comment_resolved', labelKey: 'inbox.type.commentResolved' },
  { type: 'subtask_created', labelKey: 'inbox.type.subtaskCreated' },
]

/**
 * §A2.6b — the types a chip shows, as the server is asked for them;
 * `undefined` is All, which narrows nothing.
 *
 * The list, the chip's count and Clear all take their set from here, so what
 * is listed, what is counted and what is cleared cannot be three sets. The
 * list used to be filtered in the browser from the newest fifty rows of every
 * type, so a Primary whose rows were older than fifty others showed nothing —
 * and counted nothing — while they sat on the next page.
 */
export function inboxChipTypes(filter: InboxFilter, primaryTypes: Set<string>): Set<string> | undefined {
  return filter === 'all' ? undefined : primaryTypes
}

/**
 * §2.5 — what Clear all is allowed to bin: exactly what the chip is showing.
 *
 * This has to be derived from the same set the list is filtered by, and it is a
 * pure function so that "the same set" is testable rather than a thing you
 * check by reading two call sites and hoping. It was not, briefly: the payload
 * named the hardcoded HUMAN_TYPES while the rows on screen came from the
 * member's customised `primaryTypes`, so a customised Primary cleared the rows
 * it was hiding and left the ones it was showing. Nothing errored, and you
 * cannot see the wrong rows disappear — that is the whole hazard.
 */
export function clearAllPayload(
  filter: InboxFilter,
  primaryTypes: Set<string>,
): { types?: string[] } {
  // All means all: no narrowing, so an omitted `types` rather than a list.
  const types = inboxChipTypes(filter, primaryTypes)
  return types === undefined ? {} : { types: [...types] }
}

const FILTER_LABEL_KEY: Record<InboxFilter, TranslationKey> = {
  all: 'inbox.filterAll',
  primary: 'inbox.filterPrimary',
}
const FILTER_HINT_KEY: Record<InboxFilter, TranslationKey> = {
  all: 'inbox.filterAllHint',
  primary: 'inbox.filterPrimaryHint',
}


/**
 * §2.2 — the customiser she opened from the Primary chip.
 *
 * > "Phir yahan pe CUSTOMIZE hai: ke agar koi mujhe MENTION kare to mujhe show
 * >  ho; agar kisi ne COMMENT kiya hai to mujhe … Ab neeche se REACTIONS mujhe
 * >  na show hon … Yeh log ne neeche saare ke saare inhein long list likh ke
 * >  rakhi hai; aap chaho to show kar sakte hain."
 *
 * A long list you tick through, and Primary then shows only what you ticked.
 * Every change saves immediately — this is a view filter, so there is nothing
 * to commit and no state worth losing to a mis-click on Cancel.
 */
/**
 * §2.2 — "Customize Inbox", the drawer behind the gear on the Primary tab.
 *
 * > "Primary pe yeh setting ka option hai; is par main click karti hoon to yeh
 * >  mujh se poochta hai ke mujhe kya cheezein show karwani hain."
 *
 * Her frame shows this as a container: Group by date, Sort by newest first and
 * a display mode sit above the importance list, which is the part she then
 * walks into. We had only the list, so three of the four settings the drawer
 * is named for did not exist.
 *
 * The gear stays on Primary, because that is where she opens it from. The view
 * settings it now carries apply to every tab, which is the only sensible
 * reading — nobody wants Later sorted the opposite way from Inbox.
 */
function PrimaryCustomiser({
  selected,
  pending,
  onChange,
  view,
  onViewChange,
}: {
  selected: Set<string>
  pending: boolean
  onChange: (types: string[]) => void
  view: InboxViewPrefs
  onViewChange: (patch: Partial<InboxViewPrefs>) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const toggle = (type: string) => {
    const next = new Set(selected)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    onChange([...next])
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('inbox.customisePrimary')}
        title={t('inbox.customisePrimary')}
        data-testid="primary-customise"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          {/* Click-away. A popover that only closes via its own button strands
              people who expect anywhere-else to dismiss it. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-border/70 bg-card p-2 shadow-xl"
            data-testid="primary-customise-panel"
          >
            <div className="border-b border-border/60 pb-1.5">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {t('inbox.displayHeading')}
              </p>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent/10">
                <input
                  type="checkbox"
                  checked={view.groupByDate}
                  onChange={() => onViewChange({ groupByDate: !view.groupByDate })}
                  data-testid="inbox-group-by-date"
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <span>{t('inbox.groupByDate')}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent/10">
                <input
                  type="checkbox"
                  checked={view.sortNewestFirst}
                  onChange={() => onViewChange({ sortNewestFirst: !view.sortNewestFirst })}
                  data-testid="inbox-sort-newest"
                  className="h-3.5 w-3.5 rounded border-border"
                />
                <span>{t('inbox.sortNewestFirst')}</span>
              </label>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <span className="text-[13px] text-muted-foreground">{t('inbox.density')}</span>
                <div className="ml-auto flex gap-1">
                  {(['comfortable', 'compact'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onViewChange({ density: d })}
                      aria-pressed={view.density === d}
                      data-testid={`inbox-density-${d}`}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        view.density === d
                          ? 'border-brand-500 bg-brand-500/10 text-foreground'
                          : 'border-border/70 text-muted-foreground hover:bg-accent/10',
                      )}
                    >
                      {t(d === 'comfortable' ? 'inbox.densityComfortable' : 'inbox.densityCompact')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="px-2 pb-1.5 pt-1.5 text-[11px] text-muted-foreground">
              {t('inbox.customisePrimaryHint')}
            </p>
            <div className="max-h-72 overflow-y-auto">
              {PRIMARY_SELECTABLE_TYPES.map(({ type, labelKey }) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent/10"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(type)}
                    disabled={pending}
                    onChange={() => toggle(type)}
                    data-testid={`primary-type-${type}`}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  <span>{t(labelKey)}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
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

type InboxViewPrefs = { groupByDate: boolean; sortNewestFirst: boolean; density: 'comfortable' | 'compact' }

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

  // §2.2 — what this member chose to see in Primary. The default set stands in
  // only if the preferences cannot be read; while they load, nothing that
  // depends on Primary is asked for, so its list and count do not arrive twice.
  const prefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      api<{ primaryTypes?: string[]; inboxView?: Partial<InboxViewPrefs> }>('/notifications/preferences'),
  })
  const primaryTypes = new Set(prefsQuery.data?.primaryTypes ?? [...HUMAN_TYPES])
  const chipTypes = inboxChipTypes(filter, primaryTypes)

  /*
   * This workspace's notifications, a page at a time, filtered by the server.
   *
   * It read `/notifications?view=` bare — the newest fifty, from every
   * workspace — and a failed request was caught and turned into `[]`, which
   * this page then presented as an empty Inbox. A failure is shown as one now.
   */
  const notifsQuery = useNotificationPages<Notification>(
    [workspaceId, view, typesKey(chipTypes)],
    { workspaceId, view, types: chipTypes },
    { enabled: filter === 'all' || !prefsQuery.isPending },
  )
  const countsQuery = useQuery({
    queryKey: ['notification-counts', workspaceId],
    queryFn: () => api<TriageCounts>(notificationsUrl('/notifications/counts', { workspaceId })),
  })
  const primaryCountsQuery = useQuery({
    queryKey: ['notification-counts', workspaceId, typesKey(primaryTypes)],
    enabled: !prefsQuery.isPending,
    queryFn: () =>
      api<TriageCounts>(notificationsUrl('/notifications/counts', { workspaceId, types: primaryTypes })),
  })
  /*
   * Defaulted to the behaviour that shipped before it was a choice — day
   * buckets, newest first, comfortable — so an account that never opens the
   * drawer sees no change at all.
   */
  const inboxView: InboxViewPrefs = {
    groupByDate: prefsQuery.data?.inboxView?.groupByDate ?? true,
    sortNewestFirst: prefsQuery.data?.inboxView?.sortNewestFirst ?? true,
    density: prefsQuery.data?.inboxView?.density === 'compact' ? 'compact' : 'comfortable',
  }
  const setInboxView = useMutation({
    mutationFn: (patch: Partial<InboxViewPrefs>) =>
      api('/notifications/preferences', { method: 'POST', body: { inboxView: { ...inboxView, ...patch } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  const setPrimaryTypes = useMutation({
    mutationFn: (types: string[]) =>
      api('/notifications/preferences', { method: 'POST', body: { primaryTypes: types } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  })

  /**
   * §2.2 — "aap Inbox mein jaoge, LATER mein jaoge, to aap ko woh message show
   * hoga … Later mein SAVED messages show hote hain."
   *
   * Later held only snoozed notifications; the messages you starred lived in a
   * separate panel inside Chat, which is not where she went looking for them.
   * The tab merges both now — a saved message is exactly a thing you put aside
   * for later, which is what the bucket is called.
   */
  const savedQuery = useQuery({
    enabled: view === 'later' && !!workspaceId,
    queryKey: ['chat-saved', workspaceId],
    queryFn: () => api<SavedMessage[]>(`/workspaces/${workspaceId}/chat/saved`),
  })
  const savedMessages = view === 'later' ? (savedQuery.data ?? []) : []

  /*
   * §V2-S06 frame `05:55` — "reply/thread, assign, save — same like messages".
   *
   * The same tab, for the same reason §2.2 put saved messages here: Later is
   * where a person goes looking for what they put aside, and a saved comment is
   * exactly that. It is also where ClickUp puts them — "hover over the comment
   * … it will be added to the Later tab in your Inbox" — so this is one bucket
   * with two kinds of saved thing in it, not a new panel to remember.
   */
  const savedCommentsQuery = useQuery({
    enabled: view === 'later' && !!workspaceId,
    queryKey: ['saved-comments', workspaceId],
    queryFn: () => api<SavedComment[]>(`/workspaces/${workspaceId}/comments/saved`),
  })
  const savedComments = view === 'later' ? (savedCommentsQuery.data ?? []) : []

  const { namesById } = useMentionNames(workspaceId)
  const counts = countsQuery.data
  const notifs = notifsQuery.rows
  /*
   * Counts per chip, so the split tells you where the traffic is before you
   * click into it — the server's, for the bucket on screen. They were counted
   * from the rows already loaded, and a page holds fifty: a chip reading 50
   * meant "at least 50", and a Primary whose rows were all older read 0.
   * Blank until known, never a zero that has not been counted.
   */
  const inView = (c?: TriageCounts) => c?.[view]
  const filterCounts: Record<InboxFilter, number | undefined> = {
    all: inView(counts),
    primary: inView(primaryCountsQuery.data),
  }
  // Caught up is the server's answer too. The rows on screen being read says
  // nothing about the next page.
  const unreadUnderChip = (filter === 'primary' ? primaryCountsQuery.data : counts)?.unread

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
  /*
   * §G12 [16:56] — put a row back the way it was before you opened it.
   *
   * The Inbox could mark read, mark ALL read, clear one and clear all, and had
   * no way back from the first of those. Opening a notification to see what it
   * was destroyed the only signal that you had not dealt with it — which is
   * precisely what "I'll come back to this" needs to survive.
   */
  const markUnread = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/unread`, { method: 'POST' }),
    onSuccess: refreshAll,
  })
  // This workspace's, like the list it sits above: another workspace's rows
  // were being marked read without ever having been on screen here.
  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/mark-all-read', { method: 'POST', body: { workspaceId } }),
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
        // Only what the chip is showing — the member's own Primary set, not the
        // default one it started from — and only in this workspace.
        body: { ...clearAllPayload(filter, primaryTypes), workspaceId },
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

  const stampOf = (g: NotificationGroup) =>
    view === 'cleared' ? (g.latest.dismissedAt ?? g.latest.createdAt) : g.latest.createdAt

  /*
   * Sorted before grouping, never after.
   *
   * The buckets are built by walking the list and starting a new one whenever
   * the day changes, so a list in the wrong order would produce the same day
   * twice with rows scattered between them. Reversing the rendered buckets
   * instead would put the newest day first with its oldest row at the top,
   * which is neither order anybody asked for.
   */
  const ordered = [...groupNotifications(notifs)].sort((a, b) => {
    const d = new Date(stampOf(a)).getTime() - new Date(stampOf(b)).getTime()
    return inboxView.sortNewestFirst ? -d : d
  })

  const groups = ordered
  const buckets: Array<{ bucket: string; groups: NotificationGroup[] }> = []
  for (const group of groups) {
    // "Group by date" off means one unlabelled run, not one bucket per row:
    // a header above every single notification is the same as no grouping and
    // three times the height.
    const bucket = inboxView.groupByDate ? dayBucket(stampOf(group)) : ''
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
            {(counts?.unread ?? 0) > 0 && (
              <>
                <Badge variant="gradient" className="text-[10px]" data-testid="inbox-unread-badge">
                  {t('inbox.new', { count: counts?.unread ?? 0 })}
                </Badge>
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                >
                  {t('topbar.markAllRead')}
                </button>
              </>
            )}
            {/*
              §G10-12 — Clear all is NOT gated on unread.

              It used to sit inside the `counts.unread > 0` block above, which
              made it vanish exactly when it was most wanted: an inbox of two
              hundred rows you have already read is the one you want emptied in
              a single move, and having read them was what removed the button.
              Clearing is about getting rows off the screen; whether they have
              been read is a different question.
            */}
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

        <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="inbox-controls">
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
                <span className="tabular-nums text-[10px] text-muted-foreground" data-testid={`inbox-view-count-${v}`}>
                  {counts?.[v]}
                </span>
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
                <span className="tabular-nums text-[10px] text-muted-foreground" data-testid={`inbox-chip-count-${f}`}>
                  {filterCounts[f]}
                </span>
              </button>
            ))}
            {/* §2.2 — "Primary pe yeh setting ka option hai; is par main click
                karti hoon to yeh mujh se poochta hai ke mujhe kya cheezein show
                karwani hain." */}
            {filter === 'primary' && (
              <PrimaryCustomiser
                selected={primaryTypes}
                pending={setPrimaryTypes.isPending}
                onChange={(types) => setPrimaryTypes.mutate(types)}
                view={inboxView}
                onViewChange={(patch) => setInboxView.mutate(patch)}
              />
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* §2.2 — the messages she starred, in the tab she goes looking for
              them in: "Later mein SAVED messages show hote hain". */}
          {view === 'later' && savedMessages.length > 0 && (
            <section data-testid="later-saved-messages">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('inbox.savedMessages')}
              </h2>
              <div className="space-y-1">
                {savedMessages.map((msg) => (
                  <Card
                    key={msg.id}
                    variant="glass"
                    onClick={() =>
                      navigate({
                        to: '/app/$workspaceId/chat',
                        params: { workspaceId },
                        search: { channel: msg.channelId, message: msg.id },
                      })
                    }
                    className="group p-3 cursor-pointer hover:bg-accent/5 flex items-start gap-2.5"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">
                        <MentionText text={msg.body ?? ''} namesById={namesById} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {[msg.authorName, msg.channelName && `#${msg.channelName}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {formatDistanceToNowStrict(new Date(msg.savedAt), { addSuffix: true })}
                    </span>
                    {/*
                      §12 [15:31] — "aap us pe click karoge to aap ke paas woh
                      poora message hoga; aap us ko EDIT bhi kar sakte ho, aap
                      us ko ASSIGN bhi kar sakte ho, aap us ke THREAD mein bhi
                      jaa sakte ho."

                      Those actions live on the message itself, and this row has
                      always opened it — but silently, so nothing told you they
                      were a click away. The affordance is the fix, not a second
                      copy of chat's toolbar in the Inbox: two implementations
                      of edit and assign would drift, and the one here would be
                      the poorer of them.
                    */}
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground group-hover:text-foreground"
                      data-testid={`saved-open-${msg.id}`}
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      {t('inbox.openMessage')}
                    </span>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {/* §V2-S06 frame `05:55` — the comments she saved, in the same tab
              and for the same reason as the messages above them. */}
          {view === 'later' && savedComments.length > 0 && (
            <section data-testid="later-saved-comments">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {t('inbox.savedComments')}
              </h2>
              <div className="space-y-1">
                {savedComments.map((c) => (
                  <Card
                    key={c.id}
                    variant="glass"
                    // `go` resolves the query string the API built, comment
                    // anchor included — the same helper a notification row uses.
                    onClick={() => go(c.url)}
                    className="group p-3 cursor-pointer hover:bg-accent/5 flex items-start gap-2.5"
                    data-testid={`saved-comment-${c.id}`}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] truncate">
                        <MentionText text={c.body} namesById={namesById} />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {[c.authorName, c.taskTitle].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {formatDistanceToNowStrict(new Date(c.savedAt), { addSuffix: true })}
                    </span>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground group-hover:text-foreground"
                      data-testid={`saved-comment-open-${c.id}`}
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      {t('inbox.openComment')}
                    </span>
                  </Card>
                ))}
              </div>
            </section>
          )}
          {notifsQuery.isPending ? (
            // Until the request lands, `notifs` is [] — and rendering the empty
            // state here would assert there is nothing in your inbox before we
            // know that. Skeleton rows say "still looking" instead.
            <ListSkeleton rows={7} rowClassName="h-14" />
          ) : notifsQuery.isError && notifs.length === 0 ? (
            <div className="text-center space-y-2" data-testid="inbox-load-failed">
              <p className="text-sm text-destructive">{t('inbox.loadFailed')}</p>
              <button
                type="button"
                onClick={() => void notifsQuery.refetch()}
                className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : notifs.length === 0 && savedMessages.length === 0 && savedComments.length === 0 ? (
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
              <section key={bucket || 'ungrouped'} data-testid={bucket ? `inbox-bucket-${bucket}` : 'inbox-ungrouped'}>
                {/* No header when grouping is off — an empty <h2> would still
                    take its margin and leave a gap where a date used to be. */}
                {bucket !== '' && (
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {bucketLabel(bucket)}
                  </h2>
                )}
                <div className={inboxView.density === 'compact' ? 'space-y-0.5' : 'space-y-1'}>
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
                        onMarkUnread={
                          group.items.some((n) => n.readAt)
                            ? () => group.items.filter((n) => n.readAt).forEach((n) => markUnread.mutate(n.id))
                            : undefined
                        }
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
          {notifsQuery.hasNextPage && (
            <LoadOlder query={notifsQuery} testId="inbox-load-more" />
          )}
          {unreadUnderChip === 0 && notifs.length > 0 && view === 'inbox' && (
            <p className="text-center text-xs text-muted-foreground" data-testid="inbox-caught-up">
              {t('inbox.allCaughtUp')}
            </p>
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
  onMarkUnread,
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
  /** Absent when every row in the group is already unread. */
  onMarkUnread?: () => void
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
      data-testid={`notif-${notif.id}`}
      data-unread={unread ? 'true' : 'false'}
      /* The instant this row is ordered by. On screen the time is relative
         ("53 minutes ago"), which cannot be compared; sort order is a promise
         to the user, so it has to be checkable. */
      data-created={notif.createdAt}
      variant="glass"
      onClick={() => void onOpen?.()}
      className={cn(
        'group p-3 flex items-start gap-3 hover:border-accent/30 transition-all cursor-pointer',
        // §14 [16:56] — "yahan show hoga UNREAD mein; agar to maine READ kiya
        // hai to yeh is tarah se chala jayega". The row has to look different,
        // or the Inbox cannot answer "is there anything new" at a glance —
        // which is the whole reason not to open ten chats.
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
          {onMarkUnread && view !== 'cleared' && (
            <RowAction onClick={act(onMarkUnread)} icon={MailOpen} testId={`notif-unread-${notif.id}`}>
              {t('inbox.markUnread')}
            </RowAction>
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
  testId,
}: {
  onClick: (e: React.MouseEvent) => void
  icon?: React.ElementType
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  )
}
