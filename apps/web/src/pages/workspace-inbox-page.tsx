import { useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { Bell, AtSign, MessageSquare, UserPlus, RefreshCw, Ban } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
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
  createdAt: string
  actor?: { displayName?: string | null } | null
  target?: { url?: string; entityType?: string; entityId?: string } | null
}

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

export function InboxPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/inbox' })
  const notifsQuery = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: async () => {
      try {
        return await api<Notification[]>(`/notifications`)
      } catch {
        return [] as Notification[]
      }
    },
  })

  const { namesById } = useMentionNames(workspaceId)
  const notifs = notifsQuery.data ?? []
  const unread = notifs.filter((n) => !n.readAt)
  const read = notifs.filter((n) => n.readAt)
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications', workspaceId] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  // Navigate to a resolved path, splitting any query string into `search` so
  // deep-links like /app/:ws/chat?channel=..&message=.. actually carry params.
  const go = (dest: string) => goToDestination(navigate, dest)

  const resolveDestination = (notif: Notification) => resolveNotificationDestination(notif.target, workspaceId)

  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/mark-all-read', { method: 'POST' }),
    onSuccess: async () => {
      // Matches both the inbox list (['notifications', workspaceId]) and the
      // topbar bell's recent list (['notifications', 'recent']) by prefix.
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

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
          {unread.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="gradient" className="text-[10px]">
                {t('inbox.new', { count: unread.length })}
              </Badge>
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                {t('topbar.markAllRead')}
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
          {t('inbox.subtitle')}
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {notifs.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title={t('inbox.emptyTitle')}
              description={t('inbox.emptyDesc')}
            />
          ) : (
            <>
              {unread.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {t('inbox.unread')} · {unread.length}
                  </h2>
                  <div className="space-y-1">
                    {unread.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notif={n}
                        namesById={namesById}
                        unread
                        onOpen={async () => {
                          if (!n.readAt) await markRead.mutateAsync(n.id)
                          const destination = await resolveDestination(n)
                          if (destination) go(destination)
                        }}
                        onResolve={
                          isCommentOrMention(n.type)
                            ? async () => {
                                if (!n.readAt) await markRead.mutateAsync(n.id)
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
              {read.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {t('inbox.earlier')}
                  </h2>
                  <div className="space-y-1">
                    {read.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notif={n}
                        namesById={namesById}
                        onOpen={async () => {
                          const destination = await resolveDestination(n)
                          if (destination) go(destination)
                        }}
                        onResolve={
                          isCommentOrMention(n.type)
                            ? async () => {
                                if (!n.readAt) await markRead.mutateAsync(n.id)
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NotificationRow({
  notif,
  namesById,
  unread = false,
  onOpen,
  onResolve,
}: {
  notif: Notification
  namesById: Record<string, string>
  unread?: boolean
  onOpen?: () => void | Promise<void>
  onResolve?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const meta = TYPE_META[notif.type]
  const Icon = meta?.icon ?? Bell
  const iconColor = meta?.color ?? 'text-muted-foreground'
  const label = meta ? t(meta.labelKey) : humanizeType(notif.type)
  return (
    <Card
      variant="glass"
      onClick={() => void onOpen?.()}
      className={cn(
        'p-3 flex items-start gap-3 hover:border-accent/30 transition-all cursor-pointer',
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
          <span className="text-xs text-muted-foreground ml-auto tabular-nums shrink-0">
            {formatDistanceToNowStrict(new Date(notif.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm text-foreground mt-1 truncate">{notif.title}</div>
        {notif.body && (
          <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            <MentionText text={notif.body} namesById={namesById} className="line-clamp-2" />
          </div>
        )}
        {onResolve && !notif.readAt && (
          <div className="mt-2">
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                void onResolve()
              }}
            >
              {t('inbox.resolve')}
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
