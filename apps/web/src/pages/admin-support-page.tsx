import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  toast,
} from '@rundesk/ui'
import { LifeBuoy, AlertTriangle, Loader2, Send, Inbox } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'

type Ticket = {
  id: string
  workspaceId: string
  createdById: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  slaBreached?: boolean
  firstResponseBreached?: boolean
  resolutionBreached?: boolean
  assignedToId?: string | null
  createdAt: string
  updatedAt: string
}

type TicketMessage = {
  id: string
  authorId: string
  body: string
  isStaff: boolean
  authorName?: string | null
  authorEmail?: string | null
  createdAt: string
}

type TicketDetail = Ticket & { messages: TicketMessage[] }

const STATUS_LABEL_KEYS: Record<TicketStatus, TranslationKey> = {
  open: 'support.statusOpen',
  pending: 'support.statusPending',
  resolved: 'support.statusResolved',
  closed: 'support.statusClosed',
}

const PRIORITY_LABEL_KEYS: Record<TicketPriority, TranslationKey> = {
  low: 'support.priorityLow',
  normal: 'support.priorityNormal',
  high: 'support.priorityHigh',
  urgent: 'support.priorityUrgent',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  closed: 'bg-muted text-muted-foreground',
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'text-muted-foreground',
  normal: 'text-foreground',
  high: 'text-amber-600 dark:text-amber-400',
  urgent: 'text-red-600 dark:text-red-400',
}

const STATUSES: TicketStatus[] = ['open', 'pending', 'resolved', 'closed']
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

/**
 * Super-admin support inbox (Plan §14.4). Lists every ticket with status /
 * priority / SLA-breach badges + filters, and a detail pane with the message
 * thread and status / priority controls. Backed by GET /support/tickets?scope=all.
 */
export function AdminSupportPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')

  const ticketsQuery = useQuery({
    queryKey: ['admin-support', statusFilter, priorityFilter],
    queryFn: () => {
      const params = new URLSearchParams({ scope: 'all' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      return api<Ticket[]>(`/support/tickets?${params.toString()}`)
    },
  })

  const detailQuery = useQuery({
    queryKey: ['admin-support-ticket', selectedId],
    queryFn: () => api<TicketDetail>(`/support/tickets/${selectedId}`),
    enabled: !!selectedId,
  })

  const patchTicket = useMutation({
    mutationFn: (patch: { status?: TicketStatus; priority?: TicketPriority }) =>
      api<Ticket>(`/support/tickets/${selectedId}`, { method: 'PATCH', body: patch }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin-support'] })
      await qc.invalidateQueries({ queryKey: ['admin-support-ticket', selectedId] })
      toast.success(t('support.ticketUpdated'))
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('support.genericError')),
  })

  const sendReply = useMutation({
    mutationFn: () =>
      api(`/support/tickets/${selectedId}/messages`, { method: 'POST', body: { body: reply } }),
    onSuccess: async () => {
      setReply('')
      await qc.invalidateQueries({ queryKey: ['admin-support-ticket', selectedId] })
      await qc.invalidateQueries({ queryKey: ['admin-support'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('support.genericError')),
  })

  const tickets = ticketsQuery.data ?? []
  const detail = detailQuery.data

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-4 flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold">{t('support.inboxTitle')}</h1>
        <Badge variant="soft" className="ml-1 text-[10px]">{tickets.length}</Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        {/* List + filters */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card/40">
          <div className="flex items-center gap-2 border-b border-border/60 p-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('support.filterAllStatuses')}</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('support.filterAllPriorities')}</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{t(PRIORITY_LABEL_KEYS[p])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {ticketsQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : tickets.length > 0 ? (
              <ul className="space-y-1.5">
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ticket.id)}
                      className={cn(
                        'w-full rounded-lg border p-2.5 text-left transition-colors',
                        selectedId === ticket.id
                          ? 'border-accent/50 bg-accent/10'
                          : 'border-border/40 hover:bg-card/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-sm font-medium">{ticket.subject}</span>
                        {ticket.slaBreached ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label={t('support.slaBreached')} />
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[ticket.status])}>
                          {t(STATUS_LABEL_KEYS[ticket.status])}
                        </span>
                        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', PRIORITY_COLORS[ticket.priority])}>
                          {t(PRIORITY_LABEL_KEYS[ticket.priority])}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Inbox className="h-8 w-8 opacity-40" />
                <p>{t('support.noTicketsAdmin')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-card/40">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <LifeBuoy className="h-8 w-8 opacity-40" />
              <p>{t('support.selectTicket')}</p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
                <div className="mr-auto">
                  <p className="text-sm font-semibold">{detail.subject}</p>
                  {detail.slaBreached ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {detail.firstResponseBreached ? t('support.firstResponseOverdue') : t('support.resolutionOverdue')}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={detail.priority}
                    onValueChange={(v) => patchTicket.mutate({ priority: v as TicketPriority })}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{t(PRIORITY_LABEL_KEYS[p])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={detail.status}
                    onValueChange={(v) => patchTicket.mutate({ status: v as TicketStatus })}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {detail.messages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.isStaff ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[70%] rounded-2xl px-3 py-2 text-sm',
                        msg.isStaff ? 'bg-accent/20 text-foreground' : 'bg-muted text-foreground',
                      )}
                    >
                      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                        {msg.isStaff ? t('support.staff') : (msg.authorName ?? msg.authorEmail ?? t('support.requester'))}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="flex items-end gap-2 border-t border-border/60 p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!reply.trim()) return
                  sendReply.mutate()
                }}
              >
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder={t('support.staffReplyPlaceholder')}
                  className="flex-1 resize-none"
                />
                <Button type="submit" disabled={!reply.trim() || sendReply.isPending}>
                  {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {t('support.reply')}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('support.genericError')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
