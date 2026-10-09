/**
 * THE PLANNER'S AUTOMATIONS PAGE, frame `14:32` — ClickUp's "Sync ClickUp tasks
 * to Google Calendar": "Pick a list, folder, or space…", "+ Add sync"
 * (`ledger-rows/row-1962`).
 *
 * A sync is a place this person may open — a Space, Folder, Project or List —
 * and one of their own connected calendars, with all the tasks there or only
 * those assigned to them. The tasks there with a start or due date are written
 * to that calendar and kept as they change; nothing syncs until a sync is
 * added. ClickUp syncs into a calendar of one's own, never a shared one, and
 * nobody else reaches it: so the calendars offered are the Accounts page's,
 * and with none connected the page says so and goes there.
 *
 * The places offered are the server's (`GET …/calendar-sync/places`), the same
 * set it checks a new sync against, so the picker cannot offer what is refused.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, cn, toast } from '@rundesk/ui'
import { RefreshCcwDot, Plus, Trash2 } from 'lucide-react'
import { api, refusalMessage } from '../lib/api'
import { calendarAccountsQuery } from '../lib/calendar-accounts'
import { useTranslation, type TranslationKey } from '../lib/i18n'

type PlaceType = 'space' | 'folder' | 'project' | 'list'
type SyncPlace = { type: PlaceType; id: string; name: string; depth: number; path: string[] }
type SyncRule = {
  id: string
  scopeType: PlaceType
  scopeId: string
  assignedOnly: boolean
  account: { id: string; provider: string; email: string | null; status: string }
  place: { name: string; path: string[] } | null
}

const PROVIDER_LABEL: Record<string, string> = { gcal: 'Google Calendar', outlook: 'Outlook' }
const KIND_KEY: Record<PlaceType, TranslationKey> = {
  space: 'plannerSync.kind.space',
  folder: 'plannerSync.kind.folder',
  project: 'plannerSync.kind.project',
  list: 'plannerSync.kind.list',
}

export function PlannerSyncPage({ workspaceId, onGoToAccounts }: { workspaceId: string; onGoToAccounts: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const rulesKey = ['calendar-sync-rules', workspaceId] as const
  const rules = useQuery({
    queryKey: rulesKey,
    queryFn: () => api<SyncRule[]>(`/workspaces/${workspaceId}/calendar-sync/rules`),
  })
  const accounts = useQuery(calendarAccountsQuery(workspaceId))
  const [adding, setAdding] = useState(false)
  const places = useQuery({
    queryKey: ['calendar-sync-places', workspaceId],
    queryFn: () => api<SyncPlace[]>(`/workspaces/${workspaceId}/calendar-sync/places`),
    enabled: adding,
  })
  const [place, setPlace] = useState('')
  const [accountId, setAccountId] = useState('')
  const [assignedOnly, setAssignedOnly] = useState(false)

  const connected = (accounts.data ?? []).filter((a) => a.status === 'connected')
  const chosenAccount = accountId || connected.find((a) => a.isDefault)?.id || connected[0]?.id || ''

  const add = useMutation({
    mutationFn: () => {
      const [scopeType, scopeId] = place.split(':')
      return api<SyncRule>(`/workspaces/${workspaceId}/calendar-sync/rules`, {
        method: 'POST',
        body: { scopeType, scopeId, accountId: chosenAccount, assignedOnly },
      })
    },
    onSuccess: async () => {
      toast.success(t('plannerSync.added'))
      setAdding(false)
      setPlace('')
      setAssignedOnly(false)
      await qc.invalidateQueries({ queryKey: rulesKey })
    },
    onError: (err) => toast.error(refusalMessage(err, t('plannerSync.failed'))),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspaces/${workspaceId}/calendar-sync/rules/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('plannerSync.removed'))
      await qc.invalidateQueries({ queryKey: rulesKey })
    },
    onError: (err) => toast.error(refusalMessage(err, t('plannerSync.failed'))),
  })

  const list = rules.data ?? []
  const loading = rules.isPending || accounts.isPending

  return (
    <div className="space-y-4" data-testid="planner-settings-automations">
      <div>
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <RefreshCcwDot className="h-4 w-4" aria-hidden />
          {t('plannerSync.title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('plannerSync.subtitle')}</p>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md border border-border bg-muted/30" />
          ))}
        </div>
      ) : rules.isError ? (
        <p className="text-sm text-muted-foreground" data-testid="planner-sync-unread">
          {refusalMessage(rules.error, t('plannerSync.failed'))}
        </p>
      ) : (
        <>
          {list.length === 0 ? (
            <Card className="p-4 text-center" data-testid="planner-sync-empty">
              <p className="text-sm text-muted-foreground">{t('plannerSync.empty')}</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} data-testid={`planner-sync-rule-${r.id}`} data-place={`${r.scopeType}:${r.scopeId}`}>
                  <Card className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-sm font-medium', !r.place && 'text-amber-700 dark:text-amber-300')}>
                        {r.place ? (
                          <>
                            <span className="text-muted-foreground">{t(KIND_KEY[r.scopeType])} · </span>
                            {r.place.name}
                          </>
                        ) : (
                          t('plannerSync.placeGone')
                        )}
                      </div>
                      {r.place && r.place.path.length > 0 && (
                        <div className="truncate text-[11px] text-muted-foreground">{r.place.path.join(' › ')}</div>
                      )}
                      <div className="truncate text-xs text-muted-foreground" data-testid="planner-sync-rule-calendar">
                        {t('plannerSync.toCalendar', { calendar: r.account.email ?? PROVIDER_LABEL[r.account.provider] ?? r.account.provider })}
                        {' · '}
                        {r.assignedOnly ? t('plannerSync.whichMine') : t('plannerSync.whichAll')}
                        {r.account.status !== 'connected' && ` · ${t('plannerSync.notConnected')}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`planner-sync-remove-${r.id}`}
                      aria-label={t('plannerSync.remove')}
                      title={t('plannerSync.remove')}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(r.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {connected.length === 0 ? (
            <div className="space-y-2 rounded-md border border-border/60 p-3" data-testid="planner-sync-connect-first">
              <p className="text-xs text-muted-foreground">{t('plannerSync.connectFirst')}</p>
              <Button size="sm" variant="outline" onClick={onGoToAccounts} data-testid="planner-sync-go-accounts">
                {t('plannerSync.goToAccounts')}
              </Button>
            </div>
          ) : !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="planner-sync-add">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('plannerSync.add')}
            </Button>
          ) : (
            <form
              className="space-y-3 rounded-md border border-border p-3"
              data-testid="planner-sync-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (place && chosenAccount && !add.isPending) add.mutate()
              }}
            >
              <label className="block space-y-1">
                <span className="text-[12px] font-medium">{t('plannerSync.place')}</span>
                <select
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  data-testid="planner-sync-place"
                  disabled={places.isPending}
                  // A wait is the control drawn shut, not the word "Loading" (`loading-states`).
                  aria-busy={places.isPending}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                >
                  <option value="">{t('plannerSync.choosePlace')}</option>
                  {(places.data ?? []).map((p) => (
                    <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
                      {`${' '.repeat(p.depth)}${t(KIND_KEY[p.type])} · ${p.name}`}
                    </option>
                  ))}
                </select>
                {places.isSuccess && places.data.length === 0 && (
                  <span className="block text-[11px] text-muted-foreground">{t('plannerSync.noPlaces')}</span>
                )}
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] font-medium">{t('plannerSync.calendar')}</span>
                <select
                  value={chosenAccount}
                  onChange={(e) => setAccountId(e.target.value)}
                  data-testid="planner-sync-calendar"
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                >
                  {connected.map((a) => (
                    <option key={a.id} value={a.id}>
                      {`${a.externalAccountEmail ?? PROVIDER_LABEL[a.provider] ?? a.provider} (${PROVIDER_LABEL[a.provider] ?? a.provider})`}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="space-y-1">
                <legend className="text-[12px] font-medium">{t('plannerSync.which')}</legend>
                <label className="flex items-center gap-2 text-xs">
                  <input type="radio" name="planner-sync-which" checked={!assignedOnly} onChange={() => setAssignedOnly(false)} data-testid="planner-sync-which-all" />
                  {t('plannerSync.whichAll')}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="radio" name="planner-sync-which" checked={assignedOnly} onChange={() => setAssignedOnly(true)} data-testid="planner-sync-which-mine" />
                  {t('plannerSync.whichMine')}
                </label>
              </fieldset>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!place || !chosenAccount || add.isPending} data-testid="planner-sync-save">
                  {t('plannerSync.save')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} data-testid="planner-sync-cancel">
                  {t('plannerSync.cancel')}
                </Button>
              </div>
            </form>
          )}
          <p className="text-[11px] text-muted-foreground">{t('plannerSync.oneWay')}</p>
        </>
      )}
    </div>
  )
}
