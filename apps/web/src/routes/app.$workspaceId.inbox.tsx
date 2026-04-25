import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, cn } from '@rundesk/ui'
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
  mention: { icon: AtSign, color: 'text-brand-700', label: 'Mentioned you' },
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
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Workspace</div>
        <h1 className="font-display text-2xl font-semibold text-brand-900">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mentions, comments, and updates across every workspace you're part of.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {notifs.length === 0 ? (
            <Card className="p-10 text-center">
              <Bell className="h-10 w-10 text-brand-500 mx-auto mb-2" />
              <h3 className="font-display text-lg font-semibold text-brand-900 mb-1">You're all caught up</h3>
              <p className="text-sm text-muted-foreground">
                Notifications for mentions, task assignments, and comment replies will show up here.
              </p>
            </Card>
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
      className={cn(
        'p-3 flex items-start gap-3 hover:shadow-sm transition-shadow',
        unread && 'border-l-4 border-l-brand-700',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', meta.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {notif.actor?.displayName && (
            <span className="font-medium text-sm">{notif.actor.displayName}</span>
          )}
          <span className="text-xs text-muted-foreground">{meta.label}</span>
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {formatDistanceToNowStrict(new Date(notif.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-sm text-foreground mt-0.5 truncate">{notif.title}</div>
        {notif.body && (
          <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{notif.body}</div>
        )}
      </div>
    </Card>
  )
}
