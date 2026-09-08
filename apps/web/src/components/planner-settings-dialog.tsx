import { useEffect, useState } from 'react'
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
import { Palette, PanelLeft, CalendarClock, CalendarPlus } from 'lucide-react'
import { PlannerAccountsPage } from './planner-accounts-page'
import { api, ApiError } from '../lib/api'
import { useTranslation, type TranslationKey } from '../lib/i18n'

/**
 * §V2-02 — the Planner's settings, frame `14:10`.
 *
 * The frame's left nav has seven pages: Appearance · Accounts · Sidebar ·
 * Upcoming meeting · Time blocking · AI Notetaker · Automations.
 *
 * FOUR ARE HERE. The other three are not, and their absence is the point.
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
 *   · **Upcoming meeting** is mostly a desktop menubar and a quick-join
 *     window. Rundesk has no desktop app; two of its three switches would
 *     toggle nothing.
 *   · **AI Notetaker** picks which calendar the notetaker joins. Rundesk's
 *     notetaker is gated by a feature flag and has no per-calendar binding to
 *     pick from yet.
 *   · **Automations** is "sync a list to a Google Calendar", which is a
 *     feature, not a setting — it belongs with the automations module.
 *
 * A settings nav with pages that do nothing is the facade this codebase has
 * spent two videos removing. Better four real pages and an honest gap.
 *
 * WEEK START AND TIMEZONE ARE NOT PLANNER SETTINGS. Frame `14:10` shows both
 * on the Appearance page, and they are account-wide columns on `users` that
 * every date in the product honours. This page edits those columns, so
 * changing them here changes them everywhere — rather than giving the
 * calendar a private opinion about which day the week starts on.
 */

type Settings = {
  eventStyle?: 'subtle' | 'solid'
  defaultDurationMinutes?: number
  colorTasksBy?: 'none' | 'priority' | 'status'
  showWeekends?: boolean
  blockPrefix?: string
  showAssigned?: boolean
  showOverdue?: boolean
  defaultListId?: string | null
  railSections?: string[]
  weekStart?: string
  timezone?: string
}

type ListRow = { id: string; name: string }

const PAGES: Array<{ key: 'appearance' | 'accounts' | 'sidebar' | 'timeBlocking'; icon: typeof Palette; labelKey: TranslationKey }> = [
  { key: 'appearance', icon: Palette, labelKey: 'plannerSettings.appearance' },
  // §V2-14, frame `13:50` — a person's own calendar accounts.
  { key: 'accounts', icon: CalendarPlus, labelKey: 'plannerSettings.accounts' },
  { key: 'sidebar', icon: PanelLeft, labelKey: 'plannerSettings.sidebar' },
  { key: 'timeBlocking', icon: CalendarClock, labelKey: 'plannerSettings.timeBlocking' },
]

/** The rail sections of frame `13:08`, in the order the frame lists them. */
export const RAIL_SECTIONS = ['priorities', 'meetWith', 'backlog'] as const
const RAIL_LABEL: Record<string, TranslationKey> = {
  priorities: 'planner.priorities',
  meetWith: 'planner.meetWith',
  backlog: 'planner.backlog',
}

const DURATIONS = [15, 30, 45, 60, 90, 120]
const WEEK_STARTS = ['sunday', 'monday', 'saturday']

export function PlannerSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  workspaceId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState<'appearance' | 'accounts' | 'sidebar' | 'timeBlocking'>('appearance')

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

  useEffect(() => { if (!open) setPage('appearance') }, [open])

  const railOn = (key: string) => (settings?.railSections ?? [...RAIL_SECTIONS]).includes(key)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden" data-testid="planner-settings-dialog">
        <DialogHeader className="px-5 pt-4">
          <DialogTitle>{t('plannerSettings.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[380px]">
          <nav className="w-48 shrink-0 border-r border-border/60 p-2">
            {PAGES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPage(p.key)}
                data-testid={`planner-settings-nav-${p.key}`}
                aria-current={page === p.key}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]',
                  page === p.key ? 'bg-muted font-medium' : 'hover:bg-muted/40',
                )}
              >
                <p.icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {t(p.labelKey)}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {page === 'appearance' && (
              <div className="space-y-4" data-testid="planner-settings-appearance">
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

                <Row label={t('plannerSettings.showWeekends')}>
                  <Switch
                    checked={settings?.showWeekends !== false}
                    data-testid="planner-show-weekends"
                    onCheckedChange={(next) => set({ showWeekends: next })}
                  />
                </Row>
              </div>
            )}

            {page === 'accounts' && <PlannerAccountsPage workspaceId={workspaceId} />}

            {page === 'sidebar' && (
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

            {page === 'timeBlocking' && (
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

                <Row label={t('plannerSettings.showOverdue')}>
                  <Switch
                    checked={settings?.showOverdue !== false}
                    data-testid="planner-show-overdue"
                    onCheckedChange={(next) => set({ showOverdue: next })}
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
