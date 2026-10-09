/**
 * THE TEAMS HUB'S ANALYTICS — ClickUp's (formerly Pulse): each member's online
 * status and activity, the tasks they viewed and their most-viewed ones, the
 * Lineup, and a roll-up by team, over a period moved by arrows and a name
 * searched (`ledger-rows/section3-team-analytics`). A ClickApp an owner or
 * admin turns on, open to everyone but guests or to owners and admins alone,
 * as they set it here.
 *
 * Read from `GET /workspaces/:id/analytics`, which says when the ClickApp is
 * off (`enabled: false`) and whether this reader may turn it on
 * (`mayManage`); a refusal — a guest, or a member where it is open to owners
 * and admins — is said in the server's words.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Input, cn, toast } from '@rundesk/ui'
import { ArrowLeft, ArrowRight, BarChart3 } from 'lucide-react'
import { FLAGS } from '@rundesk/feature-flags'
import { api, ApiError, refusalMessage } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'
import { presenceDotClass, type PresenceStatus } from '../lib/use-presence'

type AnalyticsPerson = {
  userId: string
  displayName: string
  email: string
  role: string
  status: PresenceStatus
  lastSeenAt: string | null
  actions: number
  views: number
  lineup: number
  mostViewed: Array<{ taskId: string; title: string; views: number }>
}
type AnalyticsTeam = { groupId: string; name: string; members: number; actions: number; views: number }
type Analytics = {
  enabled: boolean
  audience: 'members' | 'admins'
  mayManage: boolean
  from: string
  to: string
  people: AnalyticsPerson[]
  teams: AnalyticsTeam[]
}

const DAY_MS = 86_400_000
const PERIODS = [1, 7, 30] as const

export function TeamsAnalytics({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7)
  // The period ends at the end of today, and the arrows move it a period at a time.
  const [endOffset, setEndOffset] = useState(0)
  const [search, setSearch] = useState('')

  const range = useMemo(() => {
    const end = new Date()
    end.setHours(24, 0, 0, 0)
    const to = new Date(end.getTime() - endOffset * days * DAY_MS)
    const from = new Date(to.getTime() - days * DAY_MS)
    return { from, to }
  }, [days, endOffset])

  const query = useQuery({
    queryKey: ['team-analytics', workspaceId, range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      api<Analytics>(
        `/workspaces/${workspaceId}/analytics?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
      ),
    retry: false,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['team-analytics', workspaceId] })

  // The ClickApp, as Settings › ClickApps switches it.
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      api(`/feature-flags/${encodeURIComponent(FLAGS.TEAMS_ANALYTICS)}`, {
        method: 'PUT',
        body: { enabled, scope: 'workspace', scopeId: workspaceId, workspaceId },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['feature-flags', 'resolved'] })
      await refresh()
    },
    onError: (err) => toast.error(refusalMessage(err, t('teams.analytics.saveFailed'))),
  })

  const setAudience = useMutation({
    mutationFn: (audience: 'members' | 'admins') =>
      api(`/workspaces/${workspaceId}/analytics/settings`, { method: 'PATCH', body: { audience } }),
    onSuccess: async () => {
      toast.success(t('teams.analytics.audienceSaved'))
      await refresh()
    },
    onError: (err) => toast.error(refusalMessage(err, t('teams.analytics.saveFailed'))),
  })

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite" data-testid="teams-analytics-loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md border border-border bg-muted/30" />
        ))}
      </div>
    )
  }
  if (query.isError) {
    return (
      <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground" data-testid="teams-analytics-refused">
        {query.error instanceof ApiError ? query.error.message : t('teams.analytics.loadFailed')}
      </p>
    )
  }
  const data = query.data
  if (!data.enabled) {
    return (
      <div data-testid="teams-analytics-off">
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title={t('teams.analytics.offTitle')}
          description={t(data.mayManage ? 'teams.analytics.offHintManager' : 'teams.analytics.offHintMember')}
        />
        {data.mayManage && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" data-testid="teams-analytics-turn-on" disabled={setEnabled.isPending} onClick={() => setEnabled.mutate(true)}>
              {t('teams.analytics.turnOn')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  const needle = search.trim().toLowerCase()
  const people = data.people.filter((p) => `${p.displayName} ${p.email}`.toLowerCase().includes(needle))
  const fmt = (d: string) => new Date(d).toLocaleDateString()
  const lastDay = new Date(new Date(data.to).getTime() - 1).toISOString()

  return (
    <div className="space-y-4" data-testid="teams-analytics">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-label={t('teams.analytics.previous')} data-testid="teams-analytics-prev" onClick={() => setEndOffset((n) => n + 1)}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-sm tabular-nums" data-testid="teams-analytics-period">
          {days === 1 ? fmt(data.from) : t('teams.analytics.periodRange', { from: fmt(data.from), to: fmt(lastDay) })}
        </span>
        <Button
          size="sm"
          variant="outline"
          aria-label={t('teams.analytics.next')}
          data-testid="teams-analytics-next"
          disabled={endOffset === 0}
          onClick={() => setEndOffset((n) => Math.max(0, n - 1))}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <select
          value={days}
          data-testid="teams-analytics-days"
          aria-label={t('teams.analytics.periodLength')}
          onChange={(e) => {
            setDays(Number(e.target.value) as (typeof PERIODS)[number])
            setEndOffset(0)
          }}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs"
        >
          {PERIODS.map((n) => (
            <option key={n} value={n}>{t(`teams.analytics.days${n}` as TranslationKey)}</option>
          ))}
        </select>
        <Input
          data-testid="teams-analytics-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('teams.searchPeople')}
          className="h-8 max-w-xs"
        />
        {data.mayManage && (
          <div className="ml-auto flex items-center gap-2">
            <select
              value={data.audience}
              data-testid="teams-analytics-audience"
              aria-label={t('teams.analytics.audience')}
              disabled={setAudience.isPending}
              onChange={(e) => setAudience.mutate(e.target.value as 'members' | 'admins')}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <option value="members">{t('teams.analytics.audienceMembers')}</option>
              <option value="admins">{t('teams.analytics.audienceAdmins')}</option>
            </select>
            <Button size="sm" variant="outline" data-testid="teams-analytics-turn-off" disabled={setEnabled.isPending} onClick={() => setEnabled.mutate(false)}>
              {t('teams.analytics.turnOff')}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t('teams.analytics.colPerson')}</th>
              <th className="px-3 py-2 font-medium">{t('teams.analytics.colActivity')}</th>
              <th className="px-3 py-2 font-medium">{t('teams.analytics.colViews')}</th>
              <th className="px-3 py-2 font-medium">{t('teams.analytics.colLineup')}</th>
              <th className="px-3 py-2 font-medium">{t('teams.analytics.colMostViewed')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((p) => (
              <tr key={p.userId} data-testid={`teams-analytics-person-${p.userId}`} data-status={p.status}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', presenceDotClass(p.status))}
                      title={t(`teams.analytics.status.${p.status}` as TranslationKey)}
                      aria-label={t(`teams.analytics.status.${p.status}` as TranslationKey)}
                    />
                    <span className="font-medium">{p.displayName}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.lastSeenAt ? t('teams.analytics.lastActive', { when: new Date(p.lastSeenAt).toLocaleString() }) : t('teams.analytics.neverActive')}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums" data-testid="teams-analytics-actions">{p.actions}</td>
                <td className="px-3 py-2 tabular-nums" data-testid="teams-analytics-views">{p.views}</td>
                <td className="px-3 py-2 tabular-nums" data-testid="teams-analytics-lineup">{p.lineup}</td>
                <td className="px-3 py-2" data-testid="teams-analytics-most-viewed">
                  {p.mostViewed.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t('teams.analytics.noViews')}</span>
                  ) : (
                    <ul className="space-y-0.5 text-xs">
                      {p.mostViewed.map((m) => (
                        <li key={m.taskId} data-testid={`teams-analytics-viewed-${m.taskId}`}>
                          {m.title} <span className="text-muted-foreground">({m.views})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">{t('teams.analytics.noPeople')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.teams.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('teams.analytics.teamsTitle')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.teams.map((team) => (
              <li key={team.groupId} className="rounded-md border border-border p-3" data-testid={`teams-analytics-team-${team.groupId}`}>
                <div className="font-medium">{team.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('teams.analytics.teamLine', { members: team.members, actions: team.actions, views: team.views })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
