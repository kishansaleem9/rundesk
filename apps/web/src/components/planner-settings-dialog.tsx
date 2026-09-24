import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Switch,
  cn,
  toast,
} from '@rundesk/ui'
import {
  Palette,
  PanelLeft,
  CalendarClock,
  CalendarPlus,
  Video,
  Megaphone,
  LifeBuoy,
  Lightbulb,
  ArrowLeft,
} from 'lucide-react'
import { PlannerAccountsPage } from './planner-accounts-page'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/**
 * §V2-02 — the Planner's settings, frame `14:10`.
 *
 * The frame's left nav has seven pages: Appearance · Accounts · Sidebar ·
 * Upcoming meeting · Time blocking · AI Notetaker · Automations.
 *
 * FIVE ARE HERE. Two are not, and both absences are recorded decisions rather
 * than gaps — which is a different thing, and has to stay a different thing.
 *
 *   · **Accounts** IS HERE NOW, and the reasoning that kept it out was wrong.
 *     It said a page here "would be a read-only copy of one that already
 *     exists" — but the thing that existed was a single WORKSPACE-owned
 *     connection, unique on (workspace, provider), whose OAuth callback
 *     overwrote itself. So it was not one calendar each and a second account
 *     evicted the first. §V2-14 gives a person their own accounts, several of
 *     them, with a default and a set that count as busy; none of that has an
 *     entry point anywhere else, which is what makes this page real rather
 *     than duplicate.
 *   · **Upcoming meeting** IS HERE NOW, and the reason that kept it out had
 *     gone stale — the second time on this one file, which is why the process
 *     doc says to re-check a recorded reason before trusting it. The comment
 *     said the page was "mostly a desktop menubar and a quick-join window"
 *     and that "two of its three switches would toggle nothing". The
 *     countdown and the quick-join are not a menubar: `[19:16]`'s Upcoming
 *     list has drawn both since §2.8 (`workspace-meetings-page.tsx`), with
 *     nothing anywhere able to turn either off. The third switch, "Show in
 *     desktop", is a desktop NOTIFICATION, which a browser raises without a
 *     desktop app. Three switches, three readers.
 *
 * AND TWO THAT STAY OUT, for reasons that are still true today:
 *
 *   · **AI Notetaker** needs a bot that joins the call and records it. The
 *     build-vs-buy decision on that bot sits with the client and has not been
 *     made, so there is nothing for a "which calendar does it join" picker to
 *     pick between. This is a RECORDED DECISION, not an oversight, and it must
 *     not quietly become "built". (The older wording here — "gated by a
 *     feature flag, no per-calendar binding yet" — described a symptom rather
 *     than the decision, which is how a decision turns back into a to-do.)
 *   · **Automations** is parked at the client's own instruction. `[14:29]`
 *     "AUTOMATIONS aap build up kar sakte ho", then `[14:32]`–`[14:38]` "yeh
 *     aap ko baad mein bataoongi, end mein … main aap ko [samjhaoongi] ke
 *     automation kis tarah se work karta hai" — and the video ends without
 *     ever coming back to it, so the explanation was never given. The
 *     requirement has not been given yet; building a guess at it would be
 *     inventing scope, and hiding the nav entry would lose the fact that it
 *     was asked for.
 *
 * A settings nav with pages that do nothing is the facade this codebase has
 * spent two videos removing. Five real pages and two honest gaps.
 *
 * WEEK START AND TIMEZONE ARE NOT PLANNER SETTINGS. Frame `14:10` shows both
 * on the Appearance page, and they are account-wide columns on `users` that
 * every date in the product honours. This page edits those columns, so
 * changing them here changes them everywhere — rather than giving the
 * calendar a private opinion about which day the week starts on.
 */

/*
 * §V2-02e — THIS TYPE IS THE SECOND COPY, and the copy is the defect.
 *
 * `PlannerSettings` in `packages/db/src/schema/time-blocks.ts` is the one the
 * server stores and the controller accepts. This one is hand-written, and the
 * two never meet, so nothing fails to compile when they disagree. They
 * disagreed twice at once:
 *
 *   · five keys the schema declared were simply absent here, so the dialog
 *     could not draw a control for them and the page could not read them —
 *     stored, round-tripped, honoured by nothing;
 *   · `colorTasksBy` was narrowed to three of the schema's four values, so the
 *     select offered three options to a server that accepts four. Fourth
 *     instance of the duplicated-list defect in this codebase.
 *
 * Kept as a local type rather than imported because `@rundesk/ui` and the web
 * app do not depend on `@rundesk/db`; the mitigation is that every field below
 * is in the same order as the schema's, so a diff of the two is readable.
 */
type Settings = {
  eventStyle?: 'subtle' | 'solid'
  /** §V2-15a, frame `14:05` — first on the Appearance page, above Event style. */
  gridSize?: PlannerGridSize
  defaultDurationMinutes?: number
  colorTasksBy?: 'none' | 'priority' | 'status' | 'list'
  showWeekends?: boolean
  showWeekNumbers?: boolean
  alwaysOpenAtStartOfWeek?: boolean
  darkenNonWorkingHours?: boolean
  savePersonalEventsQuickly?: boolean
  blockPrefix?: string
  showAssigned?: boolean
  showRecurring?: boolean
  showOverdue?: boolean
  upcomingShowTimeLeft?: boolean
  upcomingQuickJoin?: boolean
  upcomingDesktopNotify?: boolean
  defaultListId?: string | null
  railSections?: string[]
  weekStart?: string
  timezone?: string
}

/** What the workspace publishes as "what's new" — the banner's own endpoint. */
type Announcement = { id: string; title: string; body: string; createdAt?: string }

type ListRow = { id: string; name: string }

/*
 * §V2-02d — the zones the Timezone picker offers.
 *
 * `Intl.supportedValuesOf` is the browser's own list and matches what the API
 * validates against (`new Intl.DateTimeFormat(...)` succeeding). Older engines
 * lack it, so a short honest fallback is used rather than an empty select —
 * and the account's stored zone is always included, so a value set elsewhere
 * is never silently replaced by whatever happens to sort first.
 */
const browserZone = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
})()

const ALL_ZONES: string[] = (() => {
  try {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
    if (typeof supported === 'function') return supported('timeZone')
  } catch { /* falls through */ }
  return ['UTC', 'Asia/Karachi', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles']
})()

type PageKey = 'appearance' | 'accounts' | 'sidebar' | 'upcomingMeeting' | 'timeBlocking'
/** IN THE FRAME'S ORDER. `14:10` lists them top to bottom and the nav is the
 *  one place a reordering would go unnoticed. */
const PAGES: Array<{ key: PageKey; icon: typeof Palette; labelKey: TranslationKey }> = [
  { key: 'appearance', icon: Palette, labelKey: 'plannerSettings.appearance' },
  // §V2-14, frame `13:50` — a person's own calendar accounts.
  { key: 'accounts', icon: CalendarPlus, labelKey: 'plannerSettings.accounts' },
  { key: 'sidebar', icon: PanelLeft, labelKey: 'plannerSettings.sidebar' },
  // §V2-02e — the page whose recorded reason for being absent had gone stale.
  { key: 'upcomingMeeting', icon: Video, labelKey: 'plannerSettings.upcomingMeeting' },
  { key: 'timeBlocking', icon: CalendarClock, labelKey: 'plannerSettings.timeBlocking' },
]

/**
 * The footer of frame `14:10`, under the nav: What's new · Report a problem ·
 * Feature requests.
 *
 * Each one goes somewhere that exists. "What's new" reads the workspace's own
 * announcements — the same endpoint the app-shell banner reads, so what it
 * lists is what was actually published. The other two file a real support
 * ticket through `POST /support/tickets`, which is the channel the Help page
 * and the support widget already use; they differ by the subject that routes
 * them and by the priority they carry, because `support_tickets.kind` is
 * constrained to `question | call` and inventing a third value here would mean
 * editing a module this item does not own.
 *
 * A footer link that opens nothing is the dead-control defect with a smaller
 * hit-box. Three links, three destinations, or they would not be drawn.
 */
type FooterPane = 'whatsNew' | 'reportProblem' | 'featureRequest'
const FOOTER: Array<{ key: FooterPane; icon: typeof Palette; labelKey: TranslationKey }> = [
  { key: 'whatsNew', icon: Megaphone, labelKey: 'plannerSettings.whatsNew' },
  { key: 'reportProblem', icon: LifeBuoy, labelKey: 'plannerSettings.reportProblem' },
  { key: 'featureRequest', icon: Lightbulb, labelKey: 'plannerSettings.featureRequests' },
]

/**
 * The rail sections of frame `13:05`, in the order the frame lists them.
 *
 * It used to hold three and carry this same comment. The frame lists FIVE —
 * `Priorities · Meet with · Assigned to me › · Today & overdue › · Backlog` —
 * and the planner page's own header comment described five while the page
 * rendered three, so the file documented the gap for as long as it had it.
 *
 * THIS IS THE ONE LIST. `workspace-planner-page.tsx` used to keep its own
 * hardcoded `['priorities', 'meetWith', 'backlog']` default instead of
 * importing this, which is the sixth instance of the duplicated-list bug in
 * this codebase and the one that would have hidden this very change: adding
 * two names here while the page kept its own copy means two new sections that
 * the Sidebar page offers and the rail never draws.
 */
/**
 * §V2-15a, frame `14:05` — **Grid size**: "Choose how large events and time
 * slots appear in the grid", offered as Default · Large · XL.
 *
 * ONE NUMBER, AND EVERYTHING ELSE IS DERIVED FROM IT. On the planner the hour
 * gutter's rows, the hairlines, every block rectangle's `top` and `height`,
 * the now-line's offset and the scroll-to-now on arrival are all computed from
 * the hour height, so changing this moves all of them together and none can
 * drift. 48 is kept as `default` so nobody's grid changes shape because a
 * setting was added.
 *
 * 48 → 72 → 96 rather than 48 → 64 → 80: the frame's three previews differ at
 * a glance, and two sizes six pixels apart are a control people cannot tell
 * they have used.
 *
 * Declared HERE, beside `RAIL_SECTIONS`, and imported by the planner page for
 * the same reason that one is — the control and the grid must agree about what
 * "Large" means, and the only way to guarantee that is for there to be one
 * copy of the number.
 */
export const GRID_SIZES = { default: 48, large: 72, xl: 96 } as const
export type PlannerGridSize = keyof typeof GRID_SIZES
/** The swatch row, in the frame's own order. */
export const GRID_SIZE_PREVIEW_PX = (Object.keys(GRID_SIZES) as PlannerGridSize[]).map((key) => ({
  key,
  px: GRID_SIZES[key],
}))

export const RAIL_SECTIONS = [
  'priorities',
  'meetWith',
  'assignedToMe',
  'todayOverdue',
  'backlog',
] as const
const RAIL_LABEL: Record<string, TranslationKey> = {
  priorities: 'planner.priorities',
  meetWith: 'planner.meetWith',
  assignedToMe: 'planner.assignedToMe',
  todayOverdue: 'planner.todayOverdue',
  backlog: 'planner.backlog',
}

const DURATIONS = [15, 30, 45, 60, 90, 120]
const WEEK_STARTS = ['sunday', 'monday', 'saturday']

export function PlannerSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  initialPage,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId: string
  /** §V2-14d — which page to land on. Frame `13:28`'s "Manage accounts" opens
   *  this dialog on Accounts; the gear passes nothing and gets Appearance,
   *  exactly as before. */
  initialPage?: PageKey
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState<PageKey>('appearance')
  /** Which footer destination is open, or none. Not a nav page: the frame draws
   *  these under a rule, and counting them among the pages would be a nav that
   *  claims seven entries by including three that are not settings. */
  const [pane, setPane] = useState<FooterPane | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['planner-settings', workspaceId],
    queryFn: () => api<Settings>(`/planner/${workspaceId}/settings`),
    enabled: open,
  })

  /*
   * Only fetched on the page that uses it. The "default list for new tasks"
   * picker is the one control here that needs the whole workspace's lists, and
   * opening Appearance should not pay for it.
   */
  const { data: lists = [] } = useQuery({
    queryKey: ['planner-lists', workspaceId],
    queryFn: () => api<ListRow[]>(`/lists/workspace/${workspaceId}`),
    enabled: open && page === 'timeBlocking',
  })

  const save = useMutation({
    mutationFn: (patch: Settings) => api(`/planner/${workspaceId}/settings`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      // Both keys, because the grid reads the settings and the rail reads them
      // too — a save that only refreshed one would leave half the page stale.
      void qc.invalidateQueries({ queryKey: ['planner-settings', workspaceId] })
      void qc.invalidateQueries({ queryKey: ['planner-blocks', workspaceId] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('plannerSettings.saveFailed')),
  })
  const set = (patch: Settings) => save.mutate(patch)

  /*
   * Reset on CLOSE, and choose the landing page on OPEN.
   *
   * Both halves in one effect because they are one rule: the dialog's page is
   * decided by how it was opened. Resetting only on close and never setting on
   * open would mean "Manage accounts" worked once and then re-opened on
   * Appearance for the rest of the session.
   */
  useEffect(() => {
    if (open) setPage(initialPage ?? 'appearance')
    else { setPage('appearance'); setPane(null) }
  }, [open, initialPage])

  /* The account's own zone is always offered, even if this browser's list
   * lacks it — otherwise opening the page on a different machine would show a
   * value that is not in the select, and the first save would change it. */
  const zoneOptions = useMemo(() => {
    const current = settings?.timezone ?? browserZone
    return ALL_ZONES.includes(current) ? ALL_ZONES : [current, ...ALL_ZONES]
  }, [settings?.timezone])

  const railOn = (key: string) => (settings?.railSections ?? [...RAIL_SECTIONS]).includes(key)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden" data-testid="planner-settings-dialog">
        <DialogHeader className="px-5 pt-4">
          <DialogTitle>{t('plannerSettings.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[380px]">
          <nav className="flex w-48 shrink-0 flex-col border-r border-border/60 p-2">
            {PAGES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { setPage(p.key); setPane(null) }}
                data-testid={`planner-settings-nav-${p.key}`}
                aria-current={pane === null && page === p.key}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]',
                  pane === null && page === p.key ? 'bg-muted font-medium' : 'hover:bg-muted/40',
                )}
              >
                <p.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {t(p.labelKey)}
              </button>
            ))}

            {/* Frame `14:10` puts these three at the bottom of the nav, under a
                rule. Deliberately NOT `planner-settings-nav-*`: they are not
                settings pages, and a nav count that included them would report
                seven by counting three things that change nothing. */}
            <div className="mt-auto space-y-0.5 border-t border-border/60 pt-2" data-testid="planner-settings-footer">
              {FOOTER.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setPane(f.key)}
                  data-testid={`planner-settings-footer-${f.key}`}
                  aria-current={pane === f.key}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]',
                    pane === f.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  <f.icon className="h-3.5 w-3.5" aria-hidden />
                  {t(f.labelKey)}
                </button>
              ))}
            </div>
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {pane !== null && (
              <FooterPaneView
                pane={pane}
                workspaceId={workspaceId}
                onBack={() => setPane(null)}
              />
            )}

            {pane === null && page === 'appearance' && (
              <div className="space-y-4" data-testid="planner-settings-appearance">
                {/*
                  §V2-15a, frame `14:05` — **Grid size**, and it sits FIRST,
                  above Event style, because that is where the frame puts it.
                  Order is part of what the frame specifies: a person told
                  "it's the first thing on Appearance" should find it there.

                  Each swatch previews the hour height it sets, so the control
                  shows its own effect — the frame's three cards all draw the
                  same "Team sync · 9 – 11am" at three sizes. `data-hour-px`
                  carries the number the grid will use, which is what a suite
                  can measure the real grid against; asserting the button is
                  merely `aria-pressed` would pass on a picker that remembers a
                  choice and changes nothing.
                */}
                <Row label={t('plannerSettings.gridSize')} hint={t('plannerSettings.gridSizeHint')}>
                  <div className="grid grid-cols-3 gap-1 rounded-md border border-border/70 p-0.5">
                    {GRID_SIZE_PREVIEW_PX.map(({ key, px }) => (
                      <button
                        key={key}
                        type="button"
                        data-testid={`planner-grid-size-${key}`}
                        data-hour-px={px}
                        aria-pressed={(settings?.gridSize ?? 'default') === key}
                        onClick={() => set({ gridSize: key })}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded px-2 py-1.5 text-[12px]',
                          (settings?.gridSize ?? 'default') === key
                            ? 'bg-accent/15 font-medium text-accent'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        <span
                          aria-hidden
                          data-testid={`planner-grid-size-preview-${key}`}
                          className="w-full rounded-sm border-l-2 border-accent/70 bg-accent/10"
                          /* Scaled down so three previews fit the row; the
                             RATIO is what the swatch is showing, and it is the
                             same ratio the grid will use. */
                          style={{ height: Math.round(px / 3) }}
                        />
                        {t(`plannerSettings.gridSize.${key}` as never)}
                      </button>
                    ))}
                  </div>
                </Row>

                <Row label={t('plannerSettings.eventStyle')}>
                  <div className="grid grid-cols-2 gap-1 rounded-md border border-border/70 p-0.5">
                    {(['subtle', 'solid'] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        data-testid={`planner-style-${style}`}
                        aria-pressed={(settings?.eventStyle ?? 'subtle') === style}
                        onClick={() => set({ eventStyle: style })}
                        className={cn(
                          'rounded px-2 py-1 text-[12px]',
                          (settings?.eventStyle ?? 'subtle') === style
                            ? 'bg-accent/15 font-medium text-accent'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        {t(style === 'subtle' ? 'plannerSettings.styleSubtle' : 'plannerSettings.styleSolid')}
                      </button>
                    ))}
                  </div>
                </Row>

                <Row label={t('plannerSettings.defaultDuration')} hint={t('plannerSettings.defaultDurationHint')}>
                  <select
                    value={settings?.defaultDurationMinutes ?? 60}
                    onChange={(e) => set({ defaultDurationMinutes: Number(e.target.value) })}
                    data-testid="planner-default-duration"
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                  >
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>
                        {m >= 60 ? t('plannerSettings.hours', { n: m / 60 }) : t('plannerSettings.minutes', { n: m })}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label={t('plannerSettings.colorTasksBy')}>
                  <select
                    value={settings?.colorTasksBy ?? 'none'}
                    onChange={(e) => set({ colorTasksBy: e.target.value as Settings['colorTasksBy'] })}
                    data-testid="planner-color-by"
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                  >
                    <option value="none">{t('plannerSettings.colorNone')}</option>
                    <option value="priority">{t('taskDetail.fieldPriority')}</option>
                    <option value="status">{t('taskDetail.fieldStatus')}</option>
                    {/*
                      §V2-02e — the fourth option, which the server has accepted
                      since this page shipped and this select never offered.
                      `PlannerSettings.colorTasksBy` is a four-value union; the
                      local copy of that type above was written with three, so
                      the picker was individually plausible and quietly short —
                      the duplicated-list defect, fourth instance.
                    */}
                    <option value="list">{t('plannerSettings.colorList')}</option>
                  </select>
                </Row>

                {/*
                  Week start and timezone are `users` columns, not planner ones.
                  Changing them here changes every date in the product, which is
                  what makes them worth showing here at all.
                */}
                <Row label={t('plannerSettings.startWeekOn')} hint={t('plannerSettings.accountWide')}>
                  <select
                    value={settings?.weekStart ?? 'sunday'}
                    onChange={(e) => set({ weekStart: e.target.value })}
                    data-testid="planner-week-start"
                    className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
                  >
                    {WEEK_STARTS.map((d) => (
                      <option key={d} value={d}>{t(`plannerSettings.day.${d}` as TranslationKey)}</option>
                    ))}
                  </select>
                </Row>

                {/*
                  §V2-02d, frame `14:05` — Timezone.
                  The comment above says week start AND TIMEZONE are `users`
                  columns worth showing here, and the server has validated
                  `timezone` since this page shipped — but no control was ever
                  drawn for it. So the sentence described a field that did not
                  exist, which is how the gap survived a review of this file.

                  The browser's own zone list rather than a hand-kept one: the
                  server accepts anything `Intl` accepts, so keeping a shorter
                  list here would refuse zones the API is happy with. The
                  account's current value is prepended in case it came from
                  somewhere with a longer list than this browser knows.
                */}
                <Row label={t('plannerSettings.timezone')} hint={t('plannerSettings.accountWide')}>
                  <select
                    value={settings?.timezone ?? browserZone}
                    onChange={(e) => set({ timezone: e.target.value })}
                    data-testid="planner-timezone"
                    className="h-8 max-w-[190px] rounded-md border border-border bg-background px-2 text-[12px]"
                  >
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </Row>

                {/*
                  §V2-02e, frame `14:10` — the **Others** group, headed "Choose
                  other settings for your calendar", and the four switches under
                  it with the frame's own helper text.

                  FOUR OF THESE FIVE WERE THE MIRROR DEFECT. `showWeekNumbers`,
                  `alwaysOpenAtStartOfWeek`, `darkenNonWorkingHours` and
                  `savePersonalEventsQuickly` were declared in the schema,
                  accepted by the controller and written to Postgres, and the
                  local `Settings` type above did not even list them — so this
                  page could not draw them, the planner could not read them, and
                  the Appearance page simply ended at "Show weekends". The
                  database held evidence for four features that did not exist.
                  Each switch below now names, in `time-blocks.ts`, the reader
                  that honours it.
                */}
                <div className="pt-1">
                  <div className="text-[13px] font-medium">{t('plannerSettings.others')}</div>
                  <div className="text-[11px] text-muted-foreground">{t('plannerSettings.othersHint')}</div>
                </div>

                <Row label={t('plannerSettings.showWeekends')} hint={t('plannerSettings.showWeekendsHint')}>
                  <Switch
                    checked={settings?.showWeekends !== false}
                    data-testid="planner-show-weekends"
                    onCheckedChange={(next) => set({ showWeekends: next })}
                  />
                </Row>

                {/* Default OFF, unlike its neighbours: the frame shows this one
                    switched off, and a week number nobody asked for appearing in
                    every existing planner's header would be a change of product
                    dressed as a bug fix. */}
                <Row label={t('plannerSettings.showWeekNumbers')} hint={t('plannerSettings.showWeekNumbersHint')}>
                  <Switch
                    checked={settings?.showWeekNumbers === true}
                    data-testid="planner-show-week-numbers"
                    onCheckedChange={(next) => set({ showWeekNumbers: next })}
                  />
                </Row>

                {/* Also default OFF. The frame has it on, but that is one
                    person's preference: turning it on for everybody would move
                    every existing planner off today on the next load. */}
                <Row label={t('plannerSettings.alwaysOpenAtStartOfWeek')} hint={t('plannerSettings.alwaysOpenAtStartOfWeekHint')}>
                  <Switch
                    checked={settings?.alwaysOpenAtStartOfWeek === true}
                    data-testid="planner-always-open-start"
                    onCheckedChange={(next) => set({ alwaysOpenAtStartOfWeek: next })}
                  />
                </Row>

                <Row label={t('plannerSettings.darkenNonWorkingHours')} hint={t('plannerSettings.darkenNonWorkingHoursHint')}>
                  <Switch
                    checked={settings?.darkenNonWorkingHours === true}
                    data-testid="planner-darken-non-working"
                    onCheckedChange={(next) => set({ darkenNonWorkingHours: next })}
                  />
                </Row>

                {/* ON by default, as the frame has it: the confirmation step is
                    the thing you opt INTO. */}
                <Row label={t('plannerSettings.savePersonalEventsQuickly')} hint={t('plannerSettings.savePersonalEventsQuicklyHint')}>
                  <Switch
                    checked={settings?.savePersonalEventsQuickly !== false}
                    data-testid="planner-save-personal-quickly"
                    onCheckedChange={(next) => set({ savePersonalEventsQuickly: next })}
                  />
                </Row>
              </div>
            )}

            {pane === null && page === 'accounts' && (
              <div className="space-y-5">
                <PlannerAccountsPage workspaceId={workspaceId} />
                <ConferencingRow workspaceId={workspaceId} />
              </div>
            )}

            {pane === null && page === 'sidebar' && (
              <div className="space-y-1" data-testid="planner-settings-sidebar">
                <p className="mb-2 text-[12px] text-muted-foreground">{t('plannerSettings.sidebarHint')}</p>
                {RAIL_SECTIONS.map((key) => (
                  <label key={key} className="flex items-center justify-between rounded px-2 py-2 text-[13px]">
                    {t(RAIL_LABEL[key])}
                    <Switch
                      checked={railOn(key)}
                      data-testid={`planner-rail-${key}`}
                      onCheckedChange={(next) => {
                        const current = settings?.railSections ?? [...RAIL_SECTIONS]
                        set({
                          railSections: next
                            ? [...new Set([...current, key])]
                            : current.filter((s) => s !== key),
                        })
                      }}
                    />
                  </label>
                ))}
              </div>
            )}

            {pane === null && page === 'timeBlocking' && (
              <div className="space-y-4" data-testid="planner-settings-time-blocking">
                <Row label={t('plannerSettings.blockPrefix')} hint={t('plannerSettings.blockPrefixHint')}>
                  <input
                    defaultValue={settings?.blockPrefix ?? t('planner.workOn')}
                    onBlur={(e) => set({ blockPrefix: e.target.value.trim() || undefined })}
                    data-testid="planner-block-prefix"
                    className="h-8 w-40 rounded-md border border-border bg-background px-2 text-[12px]"
                  />
                </Row>

                {/*
                  The answer to the question video 1 left open: where a task
                  made from a message, from /task, or by the AI should land.
                */}
                <Row label={t('plannerSettings.defaultList')} hint={t('plannerSettings.defaultListHint')}>
                  <select
                    value={settings?.defaultListId ?? ''}
                    onChange={(e) => set({ defaultListId: e.target.value || null })}
                    data-testid="planner-default-list"
                    className="h-8 max-w-[14rem] rounded-md border border-border bg-background px-2 text-[12px]"
                  >
                    <option value="">{t('plannerSettings.defaultListPersonal')}</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </Row>

                {/*
                  Frame `14:20` — "Show tasks assigned to me with due date".
                  `showAssigned` was declared in the settings type and saved by
                  nothing, because no control was ever drawn for it. It decides
                  whether assigned work reaches the Backlog rail at all, which
                  is why it sits above the overdue switch: turning it off makes
                  that one moot, and the planner reflects that.
                */}
                <Row label={t('plannerSettings.showAssigned')}>
                  <Switch
                    checked={settings?.showAssigned !== false}
                    data-testid="planner-show-assigned"
                    onCheckedChange={(next) => set({ showAssigned: next })}
                  />
                </Row>

                <Row label={t('plannerSettings.showOverdue')}>
                  <Switch
                    checked={settings?.showOverdue !== false}
                    data-testid="planner-show-overdue"
                    onCheckedChange={(next) => set({ showOverdue: next })}
                  />
                </Row>

                {/*
                  §V2-02e — the fifth dead key, and the only one that belongs on
                  this page rather than under Appearance.

                  A block on a recurring task is one occurrence of something
                  that happens again, and the grid had no way to say so: the
                  server never sent the task's cadence, so the next occurrences
                  could not be drawn and this switch gated nothing. Projected
                  occurrences are drawn as `planner-recurring-block`, apart from
                  real blocks, because they are a forecast rather than a record
                  — dragging one would be editing a row that does not exist yet.
                */}
                <Row label={t('plannerSettings.showRecurring')} hint={t('plannerSettings.showRecurringHint')}>
                  <Switch
                    checked={settings?.showRecurring !== false}
                    data-testid="planner-show-recurring"
                    onCheckedChange={(next) => set({ showRecurring: next })}
                  />
                </Row>
              </div>
            )}

            {/*
              §V2-02e, frame `14:10` — **Upcoming meeting**.

              Three switches, and each one turns off something that is on screen
              today with no way to stop it: the countdown badge, the Join pill
              and — "Show in desktop" — the notification a browser raises when a
              meeting becomes joinable. `workspace-meetings-page.tsx` reads all
              three. The recorded reason for leaving this page out said two of
              the three "would toggle nothing"; that was true of a desktop
              menubar Rundesk does not have, and was never true of these.
            */}
            {pane === null && page === 'upcomingMeeting' && (
              <div className="space-y-4" data-testid="planner-settings-upcoming-meeting">
                <p className="text-[12px] text-muted-foreground">{t('plannerSettings.upcomingHint')}</p>

                <Row label={t('plannerSettings.upcomingTimeLeft')} hint={t('plannerSettings.upcomingTimeLeftHint')}>
                  <Switch
                    checked={settings?.upcomingShowTimeLeft !== false}
                    data-testid="planner-upcoming-time-left"
                    onCheckedChange={(next) => set({ upcomingShowTimeLeft: next })}
                  />
                </Row>

                <Row label={t('plannerSettings.upcomingQuickJoin')} hint={t('plannerSettings.upcomingQuickJoinHint')}>
                  <Switch
                    checked={settings?.upcomingQuickJoin !== false}
                    data-testid="planner-upcoming-quick-join"
                    onCheckedChange={(next) => set({ upcomingQuickJoin: next })}
                  />
                </Row>

                {/* OFF by default, and it has to be: a notification nobody
                    asked for is the one kind of setting that cannot be undone
                    after the fact. */}
                <Row label={t('plannerSettings.upcomingDesktop')} hint={t('plannerSettings.upcomingDesktopHint')}>
                  <Switch
                    checked={settings?.upcomingDesktopNotify === true}
                    data-testid="planner-upcoming-desktop"
                    onCheckedChange={(next) => set({ upcomingDesktopNotify: next })}
                  />
                </Row>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-border/50 px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Where the three footer links go.
 *
 * `whatsNew` lists what the workspace actually published — the same
 * `announcements/active` read the app shell's banner makes, so the two can
 * never disagree about what is new. The other two file a real ticket through
 * `POST /support/tickets`, the channel the Help page and the support widget
 * already use, and they differ in the two fields that route a ticket: its
 * subject and its priority. A problem is `high`; a feature request is `low`,
 * because a wish that pages someone at 2am is a wish nobody will send twice.
 */
function FooterPaneView({
  pane,
  workspaceId,
  onBack,
}: {
  pane: FooterPane
  workspaceId: string
  onBack: () => void
}) {
  const { t } = useTranslation()

  const { data: news = [], isLoading: newsLoading } = useQuery({
    queryKey: ['workspace-announcements', workspaceId],
    queryFn: () => api<Announcement[]>(`/workspaces/${workspaceId}/announcements/active`),
    enabled: pane === 'whatsNew' && !!workspaceId,
  })

  const [text, setText] = useState('')
  const [filed, setFiled] = useState<string | null>(null)

  const isProblem = pane === 'reportProblem'
  const file = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/support/tickets', {
        method: 'POST',
        body: {
          workspaceId,
          subject: isProblem
            ? t('plannerSettings.reportSubject')
            : t('plannerSettings.featureSubject'),
          body: text.trim(),
          priority: isProblem ? 'high' : 'low',
        },
      }),
    onSuccess: (ticket) => {
      setFiled(ticket.id)
      setText('')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('plannerSettings.saveFailed')),
  })

  // A pane switch starts a new report rather than showing the last one's
  // receipt under a different heading.
  useEffect(() => { setText(''); setFiled(null) }, [pane])

  return (
    <div className="space-y-3" data-testid={`planner-settings-pane-${pane}`}>
      <button
        type="button"
        onClick={onBack}
        data-testid="planner-settings-pane-back"
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {t('common.back')}
      </button>

      {pane === 'whatsNew' ? (
        <div className="space-y-2" data-testid="planner-whats-new">
          <h3 className="text-[13px] font-medium">{t('plannerSettings.whatsNew')}</h3>
          {newsLoading ? null : news.length === 0 ? (
            /* Said plainly. An empty list and a list that failed to load look
               identical otherwise, and one of them is a bug. */
            <p className="text-[12px] text-muted-foreground" data-testid="planner-whats-new-empty">
              {t('plannerSettings.whatsNewEmpty')}
            </p>
          ) : (
            <ul className="space-y-2">
              {news.map((item) => (
                <li
                  key={item.id}
                  data-testid="planner-whats-new-item"
                  data-announcement-id={item.id}
                  className="rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="text-[12px] font-medium">{item.title}</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-[13px] font-medium">
            {t(isProblem ? 'plannerSettings.reportProblem' : 'plannerSettings.featureRequests')}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t(isProblem ? 'plannerSettings.reportProblemHint' : 'plannerSettings.featureRequestsHint')}
          </p>
          {filed ? (
            /* The ticket's own id, not "thanks!" — it is the thing you quote
               when you chase it. */
            <p className="text-[12px]" data-testid="planner-support-filed" data-ticket-id={filed}>
              {t('plannerSettings.supportFiled', { id: filed.slice(0, 8) })}
            </p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="planner-support-body"
                rows={4}
                aria-label={t(isProblem ? 'plannerSettings.reportProblem' : 'plannerSettings.featureRequests')}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
              />
              <Button
                size="sm"
                data-testid="planner-support-send"
                disabled={!text.trim() || file.isPending}
                onClick={() => file.mutate()}
              >
                {t('plannerSettings.supportSend')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** One labelled control row, so the three pages read the same way. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * §V2-14e, frame `13:36` — **Conferencing**, the last section of the Accounts
 * page: *"Connect other video conferencing providers"* over a **Zoom** row
 * reading *"Connect Zoom"* with a **Connect** button on the right.
 *
 * IT READS THE CONNECTION THE APP CENTER WRITES, and that is the whole design
 * decision. Zoom is already a complete OAuth provider in this product —
 * `integration-connections.service.ts` has its auth URL, its token exchange,
 * its profile fetch and its `missingEnvKeys` check, and the App Center's grid
 * connects it. A second "is Zoom connected?" answer kept beside the calendar
 * settings would be the duplicated-list defect in its most damaging form: two
 * surfaces disagreeing about whether an integration the user is relying on is
 * live. So this row is a second DOOR to one fact, not a second fact — the same
 * query key, the same `oauth/start`, the same `DELETE`.
 *
 * THE BUTTON IS DISABLED WHEN THE SERVER CANNOT DO IT. `providers/status`
 * reports whether `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET` are set; without them
 * `oauth/start` answers 400 and the person gets an error for something they
 * did not do wrong. An offer that cannot be honoured is the state this avoids,
 * the same reasoning the assignee picker's invite-by-email is gated on.
 */
function ConferencingRow({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const connections = useQuery({
    // The App Center's own key, so connecting there and opening this row shows
    // the same answer without either surface knowing about the other.
    queryKey: ['integration-connections', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; status: string }>>(
        `/workspaces/${workspaceId}/integrations/connections`,
      ),
    enabled: !!workspaceId,
  })
  const availability = useQuery({
    queryKey: ['integration-provider-status', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; available: boolean; missingEnvKeys?: string[] }>>(
        `/workspaces/${workspaceId}/integrations/connections/providers/status`,
      ),
    enabled: !!workspaceId,
  })

  const connected = (connections.data ?? []).some(
    (c) => c.provider === 'zoom' && c.status === 'connected',
  )
  /*
   * NEITHER STATE UNTIL THE LIST ANSWERS. `connected` is false while the list
   * is in flight, and the row drew it: a person who had connected Zoom was told
   * they had not, and offered Connect, for as long as the list took
   * (`found-24-sep/zoom-row-not-connected-while-loading`). So until it knows,
   * the row says it is checking and offers nothing; and a list that fails says
   * so, rather than "not connected".
   */
  const known = connections.isSuccess
  /*
   * `?? true` while the availability query is in flight, NOT `?? false`. A
   * button that starts disabled and enables a moment later is a button people
   * click at nothing; and `ai-value-panel.tsx:459` is this ledger's record of
   * what the other default costs — a page printing "not available" as a fact
   * about the workspace while its own query was still loading.
   */
  const available =
    availability.data === undefined
      ? true
      : (availability.data.find((p) => p.provider === 'zoom')?.available ?? false)

  const startOAuth = useMutation({
    mutationFn: () =>
      api<{ authUrl: string }>(
        `/workspaces/${workspaceId}/integrations/connections/zoom/oauth/start`,
        { method: 'POST' },
      ),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl
    },
    onError: (err) => {
      // The provider's own reason, not a generic one: "Zoom is not configured"
      // and "you are not allowed to connect apps" send the person to two
      // different places.
      toast.error(err instanceof ApiError ? err.message : t('plannerSettings.conferencing.failed'))
    },
  })
  const disconnect = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/integrations/connections/zoom`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['integration-connections', workspaceId] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('plannerSettings.conferencing.failed'))
    },
  })

  return (
    <div className="space-y-2 border-t border-border/60 pt-4" data-testid="planner-conferencing">
      <div>
        <div className="text-[13px] font-medium">{t('plannerSettings.conferencing')}</div>
        <div className="text-[11px] text-muted-foreground">
          {t('plannerSettings.conferencingHint')}
        </div>
      </div>
      <div
        className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2"
        data-testid="planner-conferencing-zoom"
        data-connected={known ? (connected ? 'true' : 'false') : undefined}
        data-state={known ? 'known' : connections.isError ? 'failed' : 'checking'}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#2D8CFF] text-[11px] font-semibold text-white"
        >
          Z
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px]">{t('plannerSettings.conferencing.zoom')}</div>
          <div className="text-[11px] text-muted-foreground" data-testid="planner-conferencing-zoom-state">
            {!known
              ? connections.isError
                ? t('plannerSettings.conferencing.checkFailed')
                : t('plannerSettings.conferencing.checking')
              : connected
                ? t('plannerSettings.conferencing.connected')
                : available
                  ? t('plannerSettings.conferencing.connectZoom')
                  : t('plannerSettings.conferencing.unavailable')}
          </div>
        </div>
        {!known ? null : connected ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[12px]"
            data-testid="planner-conferencing-disconnect"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            {t('plannerSettings.conferencing.disconnect')}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-[12px]"
            data-testid="planner-conferencing-connect"
            disabled={!available || startOAuth.isPending}
            onClick={() => startOAuth.mutate()}
          >
            {t('plannerSettings.conferencing.connect')}
          </Button>
        )}
      </div>
    </div>
  )
}
