import { useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { ListSkeleton } from '../components/loading-skeletons'
import { MessageCircleReply, CheckCircle2, FileText, MessageSquare } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api } from '../lib/api'
import { isReplyNotification } from '../lib/reply-types'
import { resolveNotificationDestination, goToDestination } from '../lib/notification-nav'
import { MentionText } from '../components/mention-text'
import { useMentionNames } from '../hooks/use-mention-names'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { ThreadReplyComposer } from '../components/chat/chat-composer'

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
/**
 * §14 [16:41] — what counts as a reply.
 *
 * "Ab yahan pe jo REPLY wapas hai — yeh wohi cheez hai … agar aap bhi yahan
 * reply karte ho na, koi NEW MESSAGE likhte ho — to phir jo hai woh mujhe yahan
 * show hoga UNREAD mein."
 *
 * Chat thread replies were missing: they arrived typed as ordinary chat
 * messages, and this page only ever looked for task and doc comments. They have
 * their own type now — not every chat message, because a top-level channel
 * message is not a reply to anything, and folding those in would make this a
 * second Inbox.
 */


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
  // §G12-2 — which row has its thread open. One at a time: the page is a list
  // to work through, and several expanded threads turn it back into a wall.
  const [openThread, setOpenThread] = useState<string | null>(null)
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
  const replies = (notifsQuery.data ?? []).filter((n) => isReplyNotification(n.type))
  const unreadCount = replies.filter((n) => !n.readAt).length
  const visible =
    filter === 'all' ? replies : replies.filter((n) => (filter === 'read' ? Boolean(n.readAt) : !n.readAt))

  const refreshCounts = async () => {
    await qc.invalidateQueries({ queryKey: ['notifications'] })
    await qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    await qc.invalidateQueries({ queryKey: ['notification-counts'] })
  }

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refreshCounts,
  })

  /*
   * The way back.
   *
   * This page moved in one direction only: opening a row marked it read on the
   * way out, and the single button did the same thing again. There was no
   * mark-unread anywhere on it — while `POST /notifications/:id/unread` has
   * existed all along and the Inbox has called it all along
   * (workspace-inbox-page.tsx:558). Built, and never joined up here.
   *
   * On a page whose whole job is "replies I still owe somebody", that means
   * reading the queue is what destroys it: one click to look, and no way to
   * put it back. Losing your place by browsing is worse than a missing
   * feature, because it punishes the thing the page is for.
   */
  const markUnread = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/unread`, { method: 'POST' }),
    onSuccess: refreshCounts,
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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/*
                        §G12-2 — answer it here.

                        A chat reply is the case she describes: "ab us ko har
                        baar chat open karne ki zaroorat nahi." Offered only for
                        chat replies, because a task or doc comment has no chat
                        thread behind it and a button that opens nothing is
                        worse than no button.
                      */}
                      {n.type === 'chat_reply' && n.target?.entityId && (
                        <button
                          type="button"
                          data-testid={`reply-open-thread-${n.id}`}
                          className="inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenThread((cur) => (cur === n.id ? null : n.id))
                          }}
                        >
                          {t(openThread === n.id ? 'replies.hideThread' : 'replies.openThread')}
                        </button>
                      )}
                      {n.readAt ? (
                        <button
                          type="button"
                          data-testid={`reply-unread-${n.id}`}
                          className="inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            void markUnread.mutateAsync(n.id)
                          }}
                        >
                          {t('inbox.markUnread')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid={`reply-resolve-${n.id}`}
                          className="inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            void markRead.mutateAsync(n.id)
                          }}
                        >
                          {t('inbox.resolve')}
                        </button>
                      )}
                    </div>
                    {openThread === n.id && n.target?.entityId && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <InlineThread
                          workspaceId={workspaceId}
                          messageId={n.target.entityId}
                          onReplied={() => {
                            // Answering it IS reading it. Leaving the row unread
                            // after you replied would put it back in the list you
                            // just cleared.
                            if (!n.readAt) void markRead.mutateAsync(n.id)
                          }}
                        />
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


type ThreadMessage = {
  id: string
  channelId: string
  body: string
  createdAt: string
  authorName?: string | null
  parentMessageId?: string | null
}

/**
 * §G12-2 [17:xx], frames 277 / 282 — read and answer a thread WITHOUT opening
 * the channel.
 *
 * > "ek person 90 chats mein hai, 90 groups mein hai … ab us ko har baar chat
 * >  open karne ki zaroorat nahi."
 *
 * That is the whole point of the page, and a row that navigates away defeats
 * it: you are back in the channel, which is the thing you came here to avoid.
 * The parent block, the reply count, the replies and a composer render in
 * place.
 *
 * Fetched lazily, on expand. Loading every thread on the list would be one
 * request per row for threads nobody opened.
 */
function InlineThread({
  workspaceId,
  messageId,
  onReplied,
}: {
  workspaceId: string
  messageId: string
  onReplied: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [alsoToChannel, setAlsoToChannel] = useState(false)

  const thread = useQuery({
    queryKey: ['replies-thread', messageId],
    // The server roots a thread at its PARENT, so passing the reply's id — which
    // is what a reply notification carries — still returns the whole thread.
    queryFn: () => api<{ parent: ThreadMessage; replies: ThreadMessage[] }>(
      `/chat/messages/${messageId}/thread`,
    ),
  })

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim()
      const parent = thread.data?.parent
      if (!body || !parent) return
      await api(`/chat/channels/${parent.channelId}/messages`, {
        method: 'POST',
        body: { body, parentMessageId: parent.id },
      })
      // "Also send to #channel" is a SECOND message in the channel, not a flag
      // on the first: that is what the checkbox does in chat, and two surfaces
      // that phrase the same promise differently is how they drift.
      if (alsoToChannel) {
        await api(`/chat/channels/${parent.channelId}/messages`, {
          method: 'POST',
          body: { body },
        })
      }
    },
    onSuccess: () => {
      setDraft('')
      setAlsoToChannel(false)
      void qc.invalidateQueries({ queryKey: ['replies-thread', messageId] })
      onReplied()
    },
  })

  if (thread.isLoading) {
    return <div className="mt-2 text-[11px] text-muted-foreground" data-testid="reply-thread-loading">…</div>
  }
  if (!thread.data) {
    return (
      <div className="mt-2 text-[11px] text-muted-foreground" data-testid="reply-thread-error">
        {t('replies.threadUnavailable')}
      </div>
    )
  }

  const { parent, replies } = thread.data
  return (
    <div className="mt-2 space-y-2" data-testid={`reply-thread-${messageId}`}>
      {/* The message the thread hangs off, so a reply has something to be a
          reply TO. Without it the answers are floating quotes. */}
      <div
        className="rounded-md border-l-2 border-l-amber-400/70 bg-amber-400/5 px-2 py-1.5"
        data-testid="reply-thread-parent"
      >
        <div className="text-[11px] text-muted-foreground">{parent.authorName ?? ''}</div>
        <div className="whitespace-pre-wrap text-[13px] text-foreground">{parent.body}</div>
      </div>
      <div className="text-[11px] text-muted-foreground" data-testid="reply-thread-count">
        {t('replies.replyCount', { count: replies.length })}
      </div>
      {replies.map((r) => (
        <div key={r.id} className="pl-2" data-testid="reply-thread-reply">
          <div className="text-[11px] text-muted-foreground">{r.authorName ?? ''}</div>
          <div className="whitespace-pre-wrap text-[13px] text-foreground">{r.body}</div>
        </div>
      ))}
      <ThreadReplyComposer
        workspaceId={workspaceId}
        value={draft}
        onChange={setDraft}
        onSend={() => send.mutate()}
        disabled={send.isPending}
        sending={send.isPending}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={alsoToChannel}
          onChange={(e) => setAlsoToChannel(e.target.checked)}
          data-testid="reply-also-to-channel"
          className="h-3 w-3 rounded border-border"
        />
        {t('replies.alsoSendToChannel')}
      </label>
    </div>
  )
}
