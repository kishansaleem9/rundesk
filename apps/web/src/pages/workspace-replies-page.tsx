import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import { MessageCircleReply, CheckCircle2, FileText, MessageSquare } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api } from '../lib/api'
import { resolveNotificationDestination, goToDestination } from '../lib/notification-nav'
import { MentionText } from '../components/mention-text'
import { useMentionNames } from '../hooks/use-mention-names'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type Notification = {
  id: string
  type: string
  title: string
  body?: string | null
  readAt?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
  target?: { url?: string; entityType?: string; entityId?: string } | null
}

/** Comment traffic aimed at you — the API's two "someone replied" types. */
const REPLY_TYPES = new Set(['task_commented', 'doc_commented'])

const FILTERS = ['unread', 'read', 'all'] as const
export type ReplyFilter = (typeof FILTERS)[number]

const FILTER_LABEL_KEY: Record<ReplyFilter, TranslationKey> = {
  unread: 'replies.filterUnread',
  read: 'replies.filterRead',
  all: 'replies.filterAll',
}

const SOURCE_ICON: Record<string, React.ElementType> = {
  task: CheckCircle2,
  doc: FileText,
  chat_message: MessageSquare,
}

/**
 * §A2.9 — Replies as a route rather than a panel on Home. The panel could only
 * ever show unread replies, and lost its state the moment you navigated away;
 * putting the filter in the URL makes read replies browsable and linkable.
 */
export function RepliesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { workspaceId } = useParams({ from: '/app/$workspaceId/replies' })
  const { filter = 'unread' } = useSearch({ from: '/app/$workspaceId/replies' })

  const notifsQuery = useQuery({
    queryKey: ['notifications', workspaceId, 'replies'],
    queryFn: async () => {
      try {
        return await api<Notification[]>('/notifications?view=all')
      } catch {
        return [] as Notification[]
      }
    },
  })

  const { namesById } = useMentionNames(workspaceId)
  const replies = (notifsQuery.data ?? []).filter((n) => REPLY_TYPES.has(n.type))
  const unreadCount = replies.filter((n) => !n.readAt).length
  const visible =
    filter === 'all' ? replies : replies.filter((n) => (filter === 'read' ? Boolean(n.readAt) : !n.readAt))

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications'] })
      await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      await qc.invalidateQueries({ queryKey: ['notification-counts'] })
    },
  })

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <MessageCircleReply className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('nav.inbox')}</div>
            <h1 className="font-display text-2xl font-semibold leading-tight">{t('replies.title')}</h1>
          </div>
          {unreadCount > 0 && (
            <Badge variant="gradient" className="ml-auto text-[10px]">
              {t('inbox.new', { count: unreadCount })}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">{t('replies.subtitle')}</p>
        <div className="mt-4 flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() =>
                navigate({ to: '/app/$workspaceId/replies', params: { workspaceId }, search: { filter: f } })
              }
              className={cn(
                'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-accent/15 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              {t(FILTER_LABEL_KEY[f])}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-1">
          {notifsQuery.isPending ? (
            // `visible` is [] until the request lands — showing the empty state
            // here would claim you have no replies before we know.
            <ListSkeleton rows={6} rowClassName="h-14" />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<MessageCircleReply className="h-6 w-6" />}
              title={t('replies.emptyTitle')}
              description={filter === 'read' ? t('replies.emptyReadDesc') : t('replies.emptyDesc')}
            />
          ) : (
            visible.map((n) => {
              const SourceIcon = n.target?.entityType ? SOURCE_ICON[n.target.entityType] : undefined
              return (
                <Card
                  key={n.id}
                  variant="glass"
                  onClick={async () => {
                    if (!n.readAt) await markRead.mutateAsync(n.id)
                    const destination = await resolveNotificationDestination(n.target, workspaceId)
                    if (destination) goToDestination(navigate, destination)
                  }}
                  className={cn(
                    'p-3 flex items-start gap-3 hover:border-accent/30 transition-all cursor-pointer',
                    !n.readAt && 'border-l-2 border-l-accent bg-accent/5',
                  )}
                >
                  {n.actor?.displayName ? (
                    <PersonAvatar name={n.actor.displayName} size="sm" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.actor?.displayName && <span className="font-medium text-sm">{n.actor.displayName}</span>}
                      {SourceIcon && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <SourceIcon className="h-3 w-3" />
                          {t(n.target?.entityType === 'doc' ? 'inbox.source.doc' : 'inbox.source.task')}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto tabular-nums shrink-0">
                        {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-sm text-foreground mt-1 truncate">{n.title}</div>
                    {n.body && (
                      <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                        <MentionText text={n.body} namesById={namesById} className="line-clamp-2" />
                      </div>
                    )}
                    {!n.readAt && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            void markRead.mutateAsync(n.id)
                          }}
                        >
                          {t('inbox.resolve')}
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
