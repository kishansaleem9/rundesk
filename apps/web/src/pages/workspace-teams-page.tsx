/**
 * §V2-12 — the Teams destination, frame `20:55`.
 *
 * `[20:53]`–`[21:05]`, and she runs out of time: "TEAM wala jo option hai …
 * yahan par jitne MEMBERS add hote hain na — yeh AI par ruk jayein." So the
 * video shows the NAV and opens none of it. The frame's flyout is All Teams ·
 * All People · Org Chart · Analytics, a rule, then My Teams with the empty
 * state "Once you are added to a Team you will see it here".
 *
 * WHAT THE GAP TURNED OUT TO BE, after checking rather than assuming. Three of
 * those four already exist — `MembersTab`, `GroupsTab` and the reporting tree —
 * and all three live inside workspace settings, whose route redirects any
 * non-admin straight back to `/app`. So looking at your own organisation
 * required admin rights: an ordinary member could not see who was on which
 * team, or who reported to whom, anywhere in the product.
 *
 * This is therefore a DESTINATION over things that already worked, not four new
 * screens. The APIs needed no change either — `GET /workspaces/:id/groups` and
 * `…/members` are both behind `WorkspaceMemberGuard`, with admin required only
 * for the mutations. The gate was the web route and nothing else.
 *
 * ANALYTICS IS DELIBERATELY ABSENT. The frame lists it; nothing exists behind
 * it, and she never opens it, so there is no way to know what a team's
 * analytics are meant to say. A fourth nav item opening a page somebody has to
 * guess the purpose of is the facade this whole audit has been removing.
 *
 * READ-ONLY, ON PURPOSE. Creating and editing teams stays in settings where the
 * permissions already live. This is the place you come to LOOK, which is what
 * was missing.
 */

import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, EmptyState, Input, cn } from '@rundesk/ui'
import { Users, User, Network } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'
import { ReportingTree } from '../components/reporting-tree'

type GroupRow = {
  id: string
  name: string
  description?: string | null
  alias?: string | null
  members?: Array<{ userId: string; displayName?: string | null; email?: string | null }>
}

type MemberRow = {
  userId: string
  displayName: string
  email: string
  role?: string
  managerId?: string | null
}

type TabId = 'teams' | 'people' | 'chart'

export function TeamsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ strict: false }) as { workspaceId?: string }
  const me = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabId>('teams')
  const [search, setSearch] = useState('')

  const groupsQuery = useQuery({
    enabled: !!workspaceId,
    queryKey: ['workspace-groups', workspaceId],
    queryFn: () => api<GroupRow[]>(`/workspaces/${workspaceId}/groups`),
  })
  const membersQuery = useQuery({
    enabled: !!workspaceId,
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api<MemberRow[]>(`/workspaces/${workspaceId}/members`),
  })

  const groups = groupsQuery.data ?? []
  const members = membersQuery.data ?? []
  const needle = search.trim().toLowerCase()

  /** The frame puts My Teams below a rule, separate from All Teams. */
  const myTeams = useMemo(
    () => (me ? groups.filter((g) => (g.members ?? []).some((m) => m.userId === me.id)) : []),
    [groups, me],
  )

  const shownGroups = groups.filter((g) => g.name.toLowerCase().includes(needle))
  const shownMembers = members.filter((m) =>
    `${m.displayName} ${m.email}`.toLowerCase().includes(needle),
  )

  const loading = groupsQuery.isPending || membersQuery.isPending

  return (
    <div className="flex h-full flex-col" data-testid="teams-page">
      <header className="border-b border-border/60 px-6 py-4">
        <h1 className="font-display text-xl">{t('teams.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('teams.subtitle')}</p>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-border/40 px-6 scrollbar-none">
        {(
          [
            { id: 'teams', labelKey: 'teams.tabAll', icon: Users },
            { id: 'people', labelKey: 'teams.tabPeople', icon: User },
            { id: 'chart', labelKey: 'teams.tabChart', icon: Network },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`teams-tab-${x.id}`}
            onClick={() => setTab(x.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === x.id
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <x.icon className="h-3.5 w-3.5" />
            {t(x.labelKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-6">
        {tab !== 'chart' && (
          <Input
            data-testid="teams-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(tab === 'teams' ? 'teams.searchTeams' : 'teams.searchPeople')}
            className="max-w-sm"
          />
        )}

        {loading ? (
          /* §2.9a — the shape of what is coming, never the word. */
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md border border-border bg-muted/30" />
            ))}
          </div>
        ) : tab === 'teams' ? (
          <>
            <Card className="overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{t('teams.allTeams')}</h2>
              </div>
              {shownGroups.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="teams-none">
                  {needle ? t('teams.noMatches') : t('teams.noTeams')}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {shownGroups.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="teams-row">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{g.name}</div>
                        {g.description && (
                          <div className="truncate text-xs text-muted-foreground">{g.description}</div>
                        )}
                      </div>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t('teams.memberCount', { count: String((g.members ?? []).length) })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/*
              My Teams, below a rule, exactly as the frame separates it — and
              with the frame's own empty state, which is the one piece of copy
              the video hands over verbatim.
            */}
            <Card className="overflow-hidden" data-testid="teams-mine">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{t('teams.myTeams')}</h2>
              </div>
              {myTeams.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-testid="teams-mine-empty">
                  {t('teams.myTeamsEmpty')}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {myTeams.map((g) => (
                    <li key={g.id} className="px-4 py-2.5 text-sm" data-testid="teams-mine-row">
                      {g.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        ) : tab === 'people' ? (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{t('teams.allPeople')}</h2>
            </div>
            {shownMembers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('teams.noMatches')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {shownMembers.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5" data-testid="teams-person">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-foreground">
                      {(m.displayName || m.email).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm">{m.displayName || m.email}</div>
                      <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          /*
           * The tree, or an honest answer when there is none. `ReportingTree`
           * renders nothing at all when nobody has a manager — correct there,
           * but a blank page here would read as broken, so the absence is
           * stated.
           */
          <>
            <ReportingTree members={members} className="overflow-hidden" />
            {!members.some((m) => m.managerId) && (
              <div data-testid="teams-chart-empty">
                <EmptyState title={t('teams.noChart')} description={t('teams.noChartHint')} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
