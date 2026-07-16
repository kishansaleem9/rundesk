import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  toast,
} from '@rundesk/ui'
import {
  LifeBuoy,
  X,
  Plus,
  ArrowLeft,
  Send,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useWorkspaceStore } from '../store/workspace'
import { useAuthStore } from '../store/auth'
import { useTranslation } from '../lib/i18n'
import type { TranslationKey } from '../lib/i18n'

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'

type Ticket = {
  id: string
  subject: string
  body: string
  status: TicketStatus
  priority: TicketPriority
  slaBreached?: boolean
  createdAt: string
  updatedAt: string
}

type TicketMessage = {
  id: string
  authorId: string
  body: string
  isStaff: boolean
  authorName?: string | null
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

/**
 * Floating support widget (Plan §14.4). A bottom-right launcher that opens a
 * panel to file a new support ticket or browse + reply to the caller's existing
 * tickets. Mounted in the authenticated app shell. Complements the AI help
 * center (the "?" AI assistant) with a human support channel.
 */
export function SupportWidget() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeWorkspace = useWorkspaceStore((s) => s.active)
  const authWorkspaces = useAuthStore((s) => s.workspaces)
  // Prefer the active workspace; fall back to the first one the user belongs to.
  const workspaceId = activeWorkspace?.id ?? authWorkspaces[0]?.id ?? null

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // New-ticket form state.
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [reply, setReply] = useState('')

  const ticketsQuery = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api<Ticket[]>('/support/tickets'),
    enabled: open && view === 'list',
  })

  const detailQuery = useQuery({
    queryKey: ['support-ticket', selectedId],
    queryFn: () => api<TicketDetail>(`/support/tickets/${selectedId}`),
    enabled: open && view === 'detail' && !!selectedId,
  })

  const createTicket = useMutation({
    mutationFn: () =>
      api<Ticket>('/support/tickets', {
        method: 'POST',
        body: { workspaceId, subject, body, priority },
      }),
    onSuccess: async (created) => {
      toast.success(t('support.ticketCreated'))
      setSubject('')
      setBody('')
      setPriority('normal')
      await qc.invalidateQueries({ queryKey: ['support-tickets'] })
      setSelectedId(created.id)
      setView('detail')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('support.genericError'))
    },
  })

  const sendReply = useMutation({
    mutationFn: () =>
      api(`/support/tickets/${selectedId}/messages`, { method: 'POST', body: { body: reply } }),
    onSuccess: async () => {
      setReply('')
      await qc.invalidateQueries({ queryKey: ['support-ticket', selectedId] })
      await qc.invalidateQueries({ queryKey: ['support-tickets'] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('support.genericError'))
    },
  })

  function openTicket(id: string) {
    setSelectedId(id)
    setView('detail')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('support.openWidget')}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[32rem] max-h-[calc(100vh-3rem)] w-[22rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-brand-gradient px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          {view !== 'list' ? (
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label={t('common.back')}
              className="rounded-md p-1 hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <LifeBuoy className="h-4 w-4" />
          )}
          <span className="text-sm font-semibold">{t('support.title')}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('common.close')}
          className="rounded-md p-1 hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {view === 'list' && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto p-3">
              {ticketsQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : ticketsQuery.data && ticketsQuery.data.length > 0 ? (
                <ul className="space-y-2">
                  {ticketsQuery.data.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => openTicket(ticket.id)}
                        className="w-full rounded-lg border border-border/50 bg-background/40 p-3 text-left transition-colors hover:bg-accent/10"
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
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(PRIORITY_LABEL_KEYS[ticket.priority])}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
                  <LifeBuoy className="h-8 w-8 opacity-40" />
                  <p>{t('support.noTickets')}</p>
                </div>
              )}
            </div>
            <div className="border-t border-border/60 p-3">
              <Button className="w-full" onClick={() => setView('new')}>
                <Plus className="h-4 w-4" />
                {t('support.newTicket')}
              </Button>
            </div>
          </div>
        )}

        {view === 'new' && (
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!subject.trim()) return
              createTicket.mutate()
            }}
          >
            {!workspaceId ? (
              <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {t('support.noWorkspace')}
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('support.subject')}</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('support.subjectPlaceholder')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('support.priority')}</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('support.priorityLow')}</SelectItem>
                  <SelectItem value="normal">{t('support.priorityNormal')}</SelectItem>
                  <SelectItem value="high">{t('support.priorityHigh')}</SelectItem>
                  <SelectItem value="urgent">{t('support.priorityUrgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('support.message')}</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder={t('support.messagePlaceholder')} />
            </div>
            <Button type="submit" disabled={!subject.trim() || !workspaceId || createTicket.isPending}>
              {createTicket.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t('support.submitTicket')}
            </Button>
          </form>
        )}

        {view === 'detail' && (
          <div className="flex h-full flex-col">
            {detailQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : detailQuery.data ? (
              <>
                <div className="border-b border-border/60 px-4 py-3">
                  <p className="text-sm font-semibold">{detailQuery.data.subject}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_COLORS[detailQuery.data.status])}>
                      {t(STATUS_LABEL_KEYS[detailQuery.data.status])}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(PRIORITY_LABEL_KEYS[detailQuery.data.priority])}
                    </span>
                    {detailQuery.data.slaBreached ? (
                      <Badge variant="soft" className="text-[9px] text-red-600">
                        {t('support.slaBreached')}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {detailQuery.data.messages.map((msg) => (
                    <div key={msg.id} className={cn('flex', msg.isStaff ? 'justify-start' : 'justify-end')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                          msg.isStaff ? 'bg-muted text-foreground' : 'bg-accent/20 text-foreground',
                        )}
                      >
                        <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                          {msg.isStaff ? t('support.staff') : (msg.authorName ?? t('support.you'))}
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
                    rows={1}
                    placeholder={t('support.replyPlaceholder')}
                    className="min-h-[2.5rem] flex-1 resize-none"
                  />
                  <Button type="submit" size="icon" disabled={!reply.trim() || sendReply.isPending} aria-label={t('support.send')}>
                    {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('support.genericError')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
