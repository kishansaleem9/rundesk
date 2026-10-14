import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input, toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { InlineSkeleton } from './loading-skeletons'

/**
 * MY AGENT PERFORMANCE, AS CLICKUP'S CREDITS TAB DRAWS IT (frame `19:00`;
 * `found-14-oct/agent-performance-carried-and-unbuilt`): a row per Super Agent
 * for the month — the actions it carried out, the time they saved at the
 * per-action benchmark, what that time was worth at the hourly rate, what the
 * agent cost in credits, and the return — with Find agent and Edit benchmark.
 * A workspace admin reads every agent; a member, the ones they made. Every
 * number is the server's (`GET /workspaces/:id/super-agents/performance`).
 */
export type AgentPerformanceRow = {
  id: string
  name: string
  avatarColor: string
  isActive: boolean
  createdBy: { id: string; name: string | null }
  runs: number
  actions: number
  credits: number
  costUsd: number
  minutesSaved: number
  valueUsd: number
  roi: number | null
}

export type AgentPerformance = {
  scope: 'all' | 'mine'
  monthStart: string
  benchmark: { minutesSavedPerAction: number; hourlyRateCents: number }
  mayEditBenchmark: boolean
  agents: AgentPerformanceRow[]
}

/** "3h 20m", as the value panel says a saving. */
function formatMinutes(total: number): string {
  const whole = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
  const h = Math.floor(whole / 60)
  const m = whole % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
const fmt = (n: number) => n.toLocaleString('en-US')

export function AgentPerformanceCard({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [find, setFind] = useState('')
  const [editing, setEditing] = useState(false)
  const [minutes, setMinutes] = useState('')
  const [rate, setRate] = useState('')
  const query = useQuery({
    queryKey: ['agent-performance', workspaceId],
    queryFn: () => api<AgentPerformance>(`/workspaces/${workspaceId}/super-agents/performance`),
    staleTime: 15_000,
    retry: false,
  })
  const save = useMutation({
    mutationFn: (patch: { minutesSavedPerAgentAction: number; hourlyRateCents: number }) =>
      api(`/ai/value/benchmark?workspaceId=${workspaceId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: async () => {
      setEditing(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['agent-performance', workspaceId] }),
        qc.invalidateQueries({ queryKey: ['ai-value', workspaceId] }),
      ])
      toast.success(t('agentPerformance.benchmarkSaved'))
    },
    // The server refuses in a sentence ("Minutes saved per agent action must be…"): shown as written.
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('agentPerformance.benchmarkFailed')),
  })
  const data = query.data
  const shown = useMemo(() => {
    const words = find.trim().toLowerCase()
    const rows = data?.agents ?? []
    return words ? rows.filter((a) => a.name.toLowerCase().includes(words)) : rows
  }, [data, find])

  const openEditor = () => {
    setMinutes(String(data?.benchmark.minutesSavedPerAction ?? 0))
    setRate(((data?.benchmark.hourlyRateCents ?? 0) / 100).toFixed(2))
    setEditing(true)
  }

  return (
    <Card className="p-4 space-y-3" data-testid="agent-performance" data-scope={data?.scope ?? ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm mb-1">{t('agentPerformance.title')}</h3>
          <p className="text-xs text-muted-foreground" data-testid="agent-performance-scope">
            {data?.scope === 'all' ? t('agentPerformance.scopeAll') : t('agentPerformance.scopeMine')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-44"
            data-testid="agent-performance-find"
            placeholder={t('agentPerformance.find')}
            aria-label={t('agentPerformance.find')}
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          {data?.mayEditBenchmark && (
            <Button size="sm" variant="outline" data-testid="agent-performance-edit-benchmark" onClick={openEditor}>
              {t('agentPerformance.editBenchmark')}
            </Button>
          )}
        </div>
      </div>

      {data && (
        <p className="text-[11px] text-muted-foreground" data-testid="agent-performance-benchmark">
          {t('agentPerformance.benchmark', {
            minutes: data.benchmark.minutesSavedPerAction,
            rate: money(data.benchmark.hourlyRateCents / 100),
          })}
        </p>
      )}

      {editing && (
        <div className="flex flex-wrap items-end gap-3" data-testid="agent-performance-benchmark-form">
          <label className="text-xs text-muted-foreground">
            {t('agentPerformance.minutesPerAction')}
            <Input
              className="mt-1 w-28"
              data-testid="agent-performance-minutes"
              value={minutes}
              inputMode="numeric"
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t('agentPerformance.hourlyRate')}
            <Input
              className="mt-1 w-32"
              data-testid="agent-performance-rate"
              value={rate}
              inputMode="decimal"
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            data-testid="agent-performance-save-benchmark"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                minutesSavedPerAgentAction: Number(minutes),
                // Cents, so the rate never rounds through a float.
                hourlyRateCents: Math.round(Number(rate) * 100),
              })
            }
          >
            {t('agentPerformance.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t('agentPerformance.cancel')}
          </Button>
        </div>
      )}

      {query.isError ? (
        <p className="text-xs text-destructive" data-testid="agent-performance-error">
          {query.error instanceof ApiError ? query.error.message : t('agentPerformance.failed')}
        </p>
      ) : !data ? (
        <div className="text-xs" data-testid="agent-performance-loading" aria-busy="true">
          <InlineSkeleton />
        </div>
      ) : data.agents.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="agent-performance-empty">
          {data.scope === 'all' ? t('agentPerformance.noneAll') : t('agentPerformance.noneMine')}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="agent-performance-no-match">
          {t('agentPerformance.noMatch', { words: find.trim() })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="agent-performance-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">{t('agentPerformance.agent')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('agentPerformance.madeBy')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('agentPerformance.actions')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('agentPerformance.timeSaved')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('agentPerformance.value')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('agentPerformance.cost')}</th>
                <th className="py-1.5 text-right font-medium">{t('agentPerformance.roi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((a) => (
                <tr key={a.id} data-testid={`agent-performance-row-${a.id}`} data-agent-name={a.name}>
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.avatarColor }} aria-hidden="true" />
                      <span data-testid="agent-performance-name">{a.name}</span>
                      {!a.isActive && <span className="text-[10px] text-muted-foreground">{t('agentPerformance.off')}</span>}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground" data-testid="agent-performance-maker">{a.createdBy.name ?? ''}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" data-testid="agent-performance-actions">{fmt(a.actions)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" data-testid="agent-performance-time">{formatMinutes(a.minutesSaved)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" data-testid="agent-performance-value">{money(a.valueUsd)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" data-testid="agent-performance-cost" title={t('agentPerformance.credits', { credits: fmt(a.credits) })}>
                    {money(a.costUsd)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums" data-testid="agent-performance-roi">
                    {a.roi === null ? '—' : `${a.roi}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
