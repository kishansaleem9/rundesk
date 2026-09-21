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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  cn,
} from '@rundesk/ui'
import { Users, User, Network, Pencil, Plus, Search, ArrowLeft, ArrowRight } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../store/auth'

/**
 * §V2-12 frames `20:57` and `21:02` — the empty state's explainer cards.
 *
 * THREE, NOT TWO, AND IN A CAROUSEL. `20:57` shows the second card clipped at
 * the right edge with `←` `→` beneath; `21:02` shows the set advanced by one,
 * with a third card entering. Declared here as one list so the carousel and
 * anything that counts them read the same thing — a second hand-kept copy is
 * the duplicated-list defect, which this audit has found five times.
 *
 * The third card's copy is the only part not read off the pixels: `21:02` cuts
 * it at the viewport after "Stay focused with P…" / "Instantly know what e…
 * and what's next on the…", and no later frame returns to it.
 */
const EMPTY_CARDS = [
  { id: 'hub', titleKey: 'teams.cardHubTitle', bodyKey: 'teams.cardHubBody' },
  { id: 'management', titleKey: 'teams.cardManageTitle', bodyKey: 'teams.cardManageBody' },
  { id: 'focus', titleKey: 'teams.cardFocusTitle', bodyKey: 'teams.cardFocusBody' },
] as const
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

/**
 * §V2-12 / frame `21:00` — one person, their job title, and the work they have
 * open. `openCount` is everything they have; `items` is the slice the card
 * draws, so a card may honestly say 12 and list 5.
 */
type PersonPreview = {
  userId: string
  displayName: string
  email: string
  role?: string | null
  jobTitle?: string | null
  openCount: number
  items: Array<{
    id: string
    title: string
    status: string
    statusCategory: 'open' | 'in_progress' | 'closed'
    dueDate?: string | null
  }>
}

/** The roles the API lets create a team (`WorkspaceAdminGuard`). */
const MAY_CREATE_TEAM = ['workspace_admin', 'manager', 'super_admin']

export function TeamsPage() {
  const { t } = useTranslation()
  const { workspaceId } = useParams({ strict: false }) as { workspaceId?: string }
  const me = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TabId>('teams')
  /* §V2-12 `20:57`/`21:02` — which card the explainer carousel is showing. */
  const [cardIndex, setCardIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingTitleFor, setEditingTitleFor] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')

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

  /*
   * The work preview is its own request and only on the tab that draws it —
   * it is a read across every member's assignments, and the teams tab has no
   * use for it.
   */
  const previewQuery = useQuery({
    enabled: !!workspaceId && tab === 'people',
    queryKey: ['teams-work-preview', workspaceId],
    queryFn: () => api<PersonPreview[]>(`/workspaces/${workspaceId}/teams/work-preview`),
  })

  const groups = groupsQuery.data ?? []
  const members = membersQuery.data ?? []
  const needle = search.trim().toLowerCase()

  /** Keyed by the person the row is about — never by index, never by position. */
  const previewByUser = useMemo(() => {
    const map = new Map<string, PersonPreview>()
    for (const row of previewQuery.data ?? []) map.set(row.userId, row)
    return map
  }, [previewQuery.data])

  const myRole = me
    ? (members.find((m) => m.userId === me.id)?.role ?? me.role)
    : undefined
  const mayCreateTeam = MAY_CREATE_TEAM.includes(String(myRole ?? ''))

  const createTeam = useMutation({
    mutationFn: (name: string) =>
      api<GroupRow>(`/workspaces/${workspaceId}/groups`, {
        method: 'POST',
        body: { name },
      }),
    onSuccess: async () => {
      setCreateOpen(false)
      setCreateName('')
      setCreateError(null)
      await queryClient.invalidateQueries({ queryKey: ['workspace-groups', workspaceId] })
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof ApiError ? err.message : t('teams.createFailed'))
    },
  })

  const saveJobTitle = useMutation({
    mutationFn: (vars: { userId: string; jobTitle: string }) =>
      api<{ userId: string; jobTitle: string | null }>(
        `/workspaces/${workspaceId}/teams/people/${vars.userId}/title`,
        { method: 'PUT', body: { jobTitle: vars.jobTitle } },
      ),
    onSuccess: async () => {
      setEditingTitleFor(null)
      await queryClient.invalidateQueries({ queryKey: ['teams-work-preview', workspaceId] })
    },
  })

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
        {/* A search box over nothing is furniture; the empty state below is the page. */}
        {tab !== 'chart' && !(tab === 'teams' && !loading && groups.length === 0) && (
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
            {groups.length === 0 ? (
              /*
               * §V2-12 / frame `20:57` — the whole page, when there is nothing
               * yet. The copy is the frame's, verbatim, and both buttons do the
               * thing they are named after: Browse People opens All People (the
               * tab beside this one, which is where the people are), and Create
               * Team creates a team, after which this state is gone because
               * there is now something to show.
               *
               * The two explainer cards are the frame's two, in its order. They
               * describe what is already behind the tabs — an overview of every
               * team, and browsing / managing the members — and deliberately do
               * NOT mention the frame's fourth nav item, Analytics, which has
               * nothing behind it and is guarded against by
               * test/e2e/teams-destination.mjs.
               */
              <div
                className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center"
                data-testid="teams-empty"
              >
                <div className="max-w-xl space-y-5">
                  <h2
                    className="font-display text-3xl leading-tight sm:text-4xl"
                    data-testid="teams-empty-headline"
                  >
                    {t('teams.emptyHeadline')}
                  </h2>
                  <p className="text-sm text-muted-foreground" data-testid="teams-empty-body">
                    {t('teams.emptyBody')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      data-testid="teams-empty-browse"
                      onClick={() => {
                        // Carry no leftover team search into the people list.
                        setSearch('')
                        setTab('people')
                      }}
                    >
                      <Search className="h-3.5 w-3.5" />
                      {t('teams.browsePeople')}
                    </Button>
                    <Button
                      variant="outline"
                      data-testid="teams-empty-create"
                      disabled={!mayCreateTeam}
                      data-disabled-reason={mayCreateTeam ? undefined : 'admin-only'}
                      title={mayCreateTeam ? undefined : t('teams.createTeamAdminOnly')}
                      onClick={() => {
                        setCreateError(null)
                        setCreateName('')
                        setCreateOpen(true)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('teams.createTeam')}
                    </Button>
                  </div>
                  {!mayCreateTeam && (
                    <p className="text-xs text-muted-foreground" data-testid="teams-empty-create-note">
                      {t('teams.createTeamAdminOnly')}
                    </p>
                  )}
                </div>

                {/*
                  §V2-12 frame `20:57` and `21:02` — THE EXPLAINER CARDS ARE A
                  CAROUSEL OF THREE, and this was a static pair.

                  `20:57` draws two cards with the second CLIPPED at the right
                  edge and `←` `→` arrows centred beneath them — the clipping
                  and the arrows are the whole claim, because a grid of two
                  needs neither. `21:02` proves it: Teams Hub has slid off to
                  the left, Member & team management is centre, and a third
                  card is entering from the right.

                  THE THIRD CARD'S COPY IS OURS AND THE REST IS THE FRAME'S.
                  `21:02` cuts the third card at the viewport, so its title
                  reads "Stay focused with P…" and its body "Instantly know
                  what e… and what's next on the…" and no frame in the video
                  ever shows the remainder. The COUNT, the pager and the
                  advance are read off the pixels; the tail of that sentence is
                  written here, which is why `teams-empty-state.mjs` asserts the
                  mechanism and the count and never our prose.
                */}
                <div data-testid="teams-empty-carousel" data-index={cardIndex}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {EMPTY_CARDS.map((card, i) => (
                      <Card
                        key={card.id}
                        className={cn('p-4', i === cardIndex ? '' : 'hidden sm:block', i < cardIndex && 'sm:hidden')}
                        data-testid="teams-empty-card"
                        data-card={card.id}
                        data-visible={i === cardIndex || i === cardIndex + 1 ? 'true' : 'false'}
                      >
                        <h3 className="text-sm font-semibold" data-testid="teams-empty-card-title">
                          {t(card.titleKey)}
                        </h3>
                        <p
                          className="mt-1.5 text-xs leading-relaxed text-muted-foreground"
                          data-testid="teams-empty-card-body"
                        >
                          {t(card.bodyKey)}
                        </p>
                      </Card>
                    ))}
                  </div>
                  {/*
                    The pager, where the frame centres it. Both arrows always
                    work: the frame shows the carousel advancing and gives no
                    end state, and an arrow that stops responding at an edge is
                    a control that looks broken rather than finished — so it
                    wraps, which is also the only behaviour three cards and two
                    arrows can express without inventing a disabled state
                    nothing draws.
                  */}
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="teams-empty-pager-prev"
                      aria-label={t('teams.cardPrev')}
                      onClick={() => setCardIndex((i) => (i - 1 + EMPTY_CARDS.length) % EMPTY_CARDS.length)}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="teams-empty-pager-next"
                      aria-label={t('teams.cardNext')}
                      onClick={() => setCardIndex((i) => (i + 1) % EMPTY_CARDS.length)}
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{t('teams.allTeams')}</h2>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  data-testid="teams-create-open"
                  disabled={!mayCreateTeam}
                  data-disabled-reason={mayCreateTeam ? undefined : 'admin-only'}
                  title={mayCreateTeam ? undefined : t('teams.createTeamAdminOnly')}
                  onClick={() => {
                    setCreateError(null)
                    setCreateName('')
                    setCreateOpen(true)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('teams.createTeam')}
                </Button>
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
            )}

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
          /*
           * §V2-12 / frame `21:00` — the per-person work preview cards.
           *
           * Each card is one person: their name, the job title under it, and
           * the numbered list of what THEY have open. The list on a card comes
           * from `previewByUser.get(m.userId)` and from nowhere else — the
           * facade this replaces is one preview fetched once and drawn under
           * every name, which looks right until two people have different work.
           */
          <>
            <h2 className="text-sm font-semibold">{t('teams.allPeople')}</h2>
            {shownMembers.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">{t('teams.noMatches')}</Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shownMembers.map((m) => {
                  const preview = previewByUser.get(m.userId)
                  const isMe = !!me && me.id === m.userId
                  const editing = editingTitleFor === m.userId
                  return (
                    <Card
                      key={m.userId}
                      className="overflow-hidden"
                      data-testid="teams-person"
                      data-user-id={m.userId}
                    >
                      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-foreground">
                          {(m.displayName || m.email).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" data-testid="teams-person-name">
                            {m.displayName || m.email}
                          </div>
                          {editing ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <Input
                                data-testid="teams-person-title-input"
                                value={titleDraft}
                                onChange={(e) => setTitleDraft(e.target.value)}
                                placeholder={t('teams.jobTitlePlaceholder')}
                                className="h-7 text-xs"
                              />
                              <Button
                                size="sm"
                                data-testid="teams-person-title-save"
                                disabled={saveJobTitle.isPending}
                                onClick={() =>
                                  saveJobTitle.mutate({ userId: m.userId, jobTitle: titleDraft })
                                }
                              >
                                {t('common.save')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid="teams-person-title-cancel"
                                onClick={() => setEditingTitleFor(null)}
                              >
                                {t('common.cancel')}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {/*
                                The job title, NOT the workspace role. The role is
                                a permission — four people would all read
                                "member" and it would look like their job.
                              */}
                              <span
                                className="truncate text-xs text-muted-foreground"
                                data-testid="teams-person-title"
                              >
                                {preview?.jobTitle || t('teams.noJobTitle')}
                              </span>
                              {isMe && (
                                <button
                                  type="button"
                                  data-testid="teams-person-title-edit"
                                  aria-label={t('teams.editJobTitle')}
                                  title={t('teams.editJobTitle')}
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setTitleDraft(preview?.jobTitle ?? '')
                                    setEditingTitleFor(m.userId)
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {/*
                          Everything they have open, which is a different number
                          from the length of the list below and is allowed to be
                          bigger. A count derived from the rendered rows could
                          never disagree with them, so it would measure nothing.
                        */}
                        <span
                          className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                          data-testid="teams-person-open-count"
                          data-open-count={preview ? String(preview.openCount) : ''}
                        >
                          {t('teams.openCount', { count: String(preview?.openCount ?? 0) })}
                        </span>
                      </div>

                      {previewQuery.isPending ? (
                        <div className="space-y-2 p-4" aria-busy="true">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-4 animate-pulse rounded bg-muted/40" />
                          ))}
                        </div>
                      ) : (preview?.items.length ?? 0) === 0 ? (
                        <p
                          className="px-4 py-5 text-center text-xs text-muted-foreground"
                          data-testid="teams-person-empty"
                        >
                          {t('teams.personNoWork')}
                        </p>
                      ) : (
                        <ol className="divide-y divide-border">
                          {(preview?.items ?? []).map((item, index) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-2.5 px-4 py-2"
                              data-testid="teams-person-item"
                              data-task-id={item.id}
                              data-status-category={item.statusCategory}
                            >
                              <span className="w-3 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {index + 1}
                              </span>
                              <span
                                className={cn(
                                  'h-2.5 w-2.5 shrink-0 rounded-full border',
                                  item.statusCategory === 'in_progress'
                                    ? 'border-warning bg-warning/70'
                                    : 'border-muted-foreground/50',
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate text-xs" data-testid="teams-person-item-title">
                                {item.title}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </>
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

      {/*
        Create Team, from the frame's second button. It makes a real team
        through the same endpoint workspace settings uses, so the team it mints
        is the team everything else already understands — one that can be
        opened, renamed and given members — rather than a row this page alone
        knows about.
      */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError(null) } }}>
        <DialogContent data-testid="teams-create-dialog">
          <DialogHeader>
            <DialogTitle>{t('teams.createTeam')}</DialogTitle>
            <DialogDescription>{t('teams.createTeamHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="teams-create-name">{t('teams.teamName')}</Label>
            <Input
              id="teams-create-name"
              data-testid="teams-create-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t('teams.teamNamePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createName.trim()) createTeam.mutate(createName.trim())
              }}
            />
            {createError && (
              <p className="text-xs text-danger" data-testid="teams-create-error">
                {createError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="teams-create-cancel"
              onClick={() => { setCreateOpen(false); setCreateError(null) }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              data-testid="teams-create-submit"
              disabled={createTeam.isPending || !createName.trim()}
              onClick={() => createTeam.mutate(createName.trim())}
            >
              {createTeam.isPending ? t('teams.creating') : t('teams.createTeam')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
