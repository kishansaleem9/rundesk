import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, EmptyState, Badge, PersonAvatar, cn } from '@rundesk/ui'
import { Bell, AtSign, MessageSquare, CheckSquare, UserPlus } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { api } from '../lib/api'

export const Route = createFileRoute('/app/$workspaceId/inbox')({
  component: InboxPage,
})

type Notification = {
  id: string
  type: 'mention' | 'comment' | 'task_assigned' | 'task_completed' | 'watcher' | string
  title: string
  body?: string | null
  readAt?: string | null
  createdAt: string
  actor?: { displayName?: string | null } | null
  targetUrl?: string | null
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  mention: { icon: AtSign, color: 'text-accent', label: 'Mentioned you' },
  comment: { icon: MessageSquare, color: 'text-blue-500', label: 'Commented' },
  task_assigned: { icon: UserPlus, color: 'text-emerald-500', label: 'Assigned you' },
  task_completed: { icon: CheckSquare, color: 'text-emerald-600', label: 'Completed' },
  watcher: { icon: Bell, color: 'text-amber-500', label: 'Watching' },
}

function InboxPage() {
  const { workspaceId } = Route.useParams()
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

  const notifs = notifsQuery.data ?? []
  const unread = notifs.filter((n) => !n.readAt)
  const read = notifs.filter((n) => n.readAt)

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5 border-b border-border/40">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Inbox</div>
            <h1 className="font-display text-2xl font-semibold leading-tight">Notifications</h1>
          </div>
          {unread.length > 0 && (
            <Badge variant="gradient" className="ml-auto text-[10px]">
              {unread.length} new
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
          Mentions, comments, and updates across every workspace you're part of.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {notifs.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title="You're all caught up"
              description="Mentions, task assignments and replies will land here. Take a breath."
            />
          ) : (
            <>
              {unread.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Unread · {unread.length}
                  </h2>
                  <div className="space-y-1">
                    {unread.map((n) => (
                      <NotificationRow key={n.id} notif={n} unread />
                    ))}
                  </div>
                </section>
              )}
              {read.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Earlier
                  </h2>
                  <div className="space-y-1">
                    {read.map((n) => (
                      <NotificationRow key={n.id} notif={n} />
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

function NotificationRow({ notif, unread = false }: { notif: Notification; unread?: boolean }) {
  const meta = TYPE_META[notif.type] ?? { icon: Bell, color: 'text-muted-foreground', label: notif.type }
  const Icon = meta.icon
  return (
    <Card
      variant="glass"
      className={cn(
        'p-3 flex items-start gap-3 hover:border-accent/30 transition-all cursor-pointer',
        unread && 'border-l-2 border-l-accent bg-accent/5',
      )}
    >
      {notif.actor?.displayName ? (
        <PersonAvatar name={notif.actor.displayName} size="sm" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {notif.actor?.displayName && (
            <span className="font-medium text-sm">{notif.actor.displayName}</span>
          )}
          <Badge variant="soft" className="text-[10px]">
            <Icon className={cn('h-3 w-3', meta.color)} />
            {meta.label}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums shrink-0">
            {formatDistanceToNowStrict(new Date(notif.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm text-foreground mt-1 truncate">{notif.title}</div>
        {notif.body && (
          <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{notif.body}</div>
        )}
      </div>
    </Card>
  )
}
