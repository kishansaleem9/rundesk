import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  Button,
  Badge,
  PersonAvatar,
  EmptyState,
  Textarea,
  cn,
} from '@rundesk/ui'
import {
  Check,
  X,
  Clock,
  ChevronRight,
  ChevronDown,
  CheckCheck,
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react'

export const Route = createFileRoute('/app/$workspaceId/time/approvals')({
  component: TimeApprovalsPage,
})

type Timesheet = {
  id: string
  name: string
  weekOf: string
  total: number // hours
  billable: number
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  entries: Array<{ project: string; hours: number; billable: boolean; note?: string }>
}

const MOCK: Timesheet[] = [
  {
    id: 't1',
    name: 'Hamda Tahir',
    weekOf: 'Apr 22 — Apr 28',
    total: 38.5,
    billable: 32,
    status: 'pending',
    entries: [
      { project: 'v1.0 launch · onboarding', hours: 18, billable: true },
      { project: 'AI agent rollout · prompts', hours: 9, billable: true },
      { project: 'Migration playbook · docs', hours: 5, billable: true },
      { project: 'Internal — pairing & reviews', hours: 6.5, billable: false },
    ],
  },
  {
    id: 't2',
    name: 'Iqra Khalid',
    weekOf: 'Apr 22 — Apr 28',
    total: 42,
    billable: 40,
    status: 'pending',
    entries: [
      { project: 'v1.0 launch · workload view', hours: 22, billable: true, note: 'Custom heat-map + tooltips' },
      { project: 'v1.0 launch · onboarding', hours: 12, billable: true },
      { project: 'Design system polish', hours: 6, billable: true },
      { project: 'Internal — design review', hours: 2, billable: false },
    ],
  },
  {
    id: 't3',
    name: 'Mali Acme',
    weekOf: 'Apr 22 — Apr 28',
    total: 39,
    billable: 36,
    status: 'pending',
    entries: [
      { project: 'AI agent rollout · backend', hours: 24, billable: true },
      { project: 'v1.0 launch · authz', hours: 12, billable: true },
      { project: 'Internal — code review', hours: 3, billable: false },
    ],
  },
  {
    id: 't4',
    name: 'Sara Idris',
    weekOf: 'Apr 15 — Apr 21',
    total: 40,
    billable: 38,
    status: 'approved',
    entries: [{ project: 'v1.0 launch', hours: 38, billable: true }, { project: 'Internal', hours: 2, billable: false }],
  },
  {
    id: 't5',
    name: 'Bilal Khan',
    weekOf: 'Apr 15 — Apr 21',
    total: 42,
    billable: 28,
    status: 'rejected',
    rejectionReason: 'Please split internal time more granularly — needs project tags.',
    entries: [{ project: 'Internal', hours: 14, billable: false }, { project: 'v1.0 launch', hours: 28, billable: true }],
  },
]

function TimeApprovalsPage() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set([MOCK[0].id]))
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const pending = MOCK.filter((m) => m.status === 'pending')
  const history = MOCK.filter((m) => m.status !== 'pending')
  const list = tab === 'pending' ? pending : history

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <header>
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          Time tracking
        </div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-white shadow-glow">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          Approvals
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
          Review and approve weekly timesheets from your team.
        </p>
      </header>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-card/40 border border-border/60 rounded-lg p-1">
          <button
            onClick={() => setTab('pending')}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
              tab === 'pending'
                ? 'bg-brand-gradient text-white shadow-sm'
                : 'hover:bg-card/60 text-muted-foreground',
            )}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-all',
              tab === 'history'
                ? 'bg-brand-gradient text-white shadow-sm'
                : 'hover:bg-card/60 text-muted-foreground',
            )}
          >
            History ({history.length})
          </button>
        </div>
        {tab === 'pending' && selected.size > 0 && (
          <div className="flex items-center gap-2 animate-fade-in">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm">
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button variant="gradient" size="sm">
              <CheckCheck className="h-3.5 w-3.5" /> Approve all
            </Button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="No timesheets to review"
          description={tab === 'pending' ? 'You\'re caught up. New submissions land here.' : 'Once you process timesheets, they\'ll appear here.'}
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((t) => (
            <Card key={t.id} variant="glass" className="overflow-hidden p-0">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-card/40 transition-colors"
                onClick={() => toggleExpand(t.id)}
              >
                {tab === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleSelect(t.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded"
                  />
                )}
                <PersonAvatar name={t.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.status === 'pending' && (
                      <Badge variant="warning" className="text-[9px] uppercase">Pending</Badge>
                    )}
                    {t.status === 'approved' && (
                      <Badge variant="success" className="text-[9px] uppercase">
                        <Check className="h-2.5 w-2.5" /> Approved
                      </Badge>
                    )}
                    {t.status === 'rejected' && (
                      <Badge variant="destructive" className="text-[9px] uppercase">
                        <AlertTriangle className="h-2.5 w-2.5" /> Rejected
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Week of {t.weekOf}
                    <span>·</span>
                    <span className="text-foreground tabular-nums">{t.total}h</span>
                    <span className="text-success tabular-nums">{t.billable}h billable</span>
                  </div>
                </div>
                {tab === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(t.id)}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button variant="gradient" size="sm">
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                  </div>
                )}
                {expanded.has(t.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>

              {expanded.has(t.id) && (
                <div className="border-t border-border/30 bg-card/20 p-4 space-y-2 animate-fade-in">
                  {t.rejectionReason && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
                      <span className="font-medium text-destructive">Rejection reason: </span>
                      {t.rejectionReason}
                    </div>
                  )}
                  <ul className="divide-y divide-border/30">
                    {t.entries.map((e, i) => (
                      <li key={i} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="truncate">{e.project}</div>
                          {e.note && <div className="text-xs text-muted-foreground truncate">{e.note}</div>}
                        </div>
                        {e.billable && (
                          <Badge variant="success" className="text-[9px] uppercase">Billable</Badge>
                        )}
                        <span className="font-medium tabular-nums w-16 text-right shrink-0">{e.hours}h</span>
                      </li>
                    ))}
                  </ul>

                  {rejecting === t.id && (
                    <div className="rounded-md border border-border/40 bg-card/40 p-3 mt-3 space-y-2">
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Tell them what to fix…"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setRejecting(null); setReason('') }}>
                          Cancel
                        </Button>
                        <Button variant="destructive" size="sm">
                          Send rejection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
