/**
 * §V2-14 — "Accounts: Manage your accounts", frame `13:50`.
 *
 * `[13:32]`–`[13:38]` "'Manage Account' pe click karoongi … 'Add Account' … aur
 * jitna chahoon main add kar sakti hoon."
 *
 * THE TWO SETTINGS BENEATH THE LIST ARE DIFFERENT IN KIND, and that is what the
 * frame means by a primary and a secondary calendar. **Default calendar** is
 * where new events are WRITTEN, so it is a single choice and the database
 * enforces that. **Busy calendars** are READ to work out when somebody is free,
 * so any number may be on — a person with a work account and a personal one
 * wants work as the default and both counted as busy.
 *
 * They are rendered as one list with two controls per row rather than as the
 * frame's two separate pickers. The frame's Default picker shows an email,
 * which is Google's name for an account's primary calendar, so the choice it
 * offers is really "which account" — and once that is true, two pickers listing
 * the same accounts are two places to keep in step for no gain.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, cn, toast } from '@rundesk/ui'
import { CalendarPlus, Check, Trash2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

type CalendarAccount = {
  id: string
  provider: string
  externalAccountEmail: string | null
  status: string
  isDefault: boolean
  countsAsBusy: boolean
}

const PROVIDER_LABEL: Record<string, string> = {
  gcal: 'Google Calendar',
  outlook: 'Outlook',
}

export function PlannerAccountsPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const key = ['calendar-accounts', workspaceId]

  const query = useQuery({
    queryKey: key,
    queryFn: () => api<CalendarAccount[]>(`/workspaces/${workspaceId}/calendar-sync/accounts`),
  })

  const refresh = async () => { await qc.invalidateQueries({ queryKey: key }) }
  const fail = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : t('plannerAccounts.failed'))

  const setDefault = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/calendar-sync/accounts/${id}/default`, { method: 'POST' }),
    onSuccess: refresh,
    onError: fail,
  })
  const setBusy = useMutation({
    mutationFn: ({ id, countsAsBusy }: { id: string; countsAsBusy: boolean }) =>
      api(`/workspaces/${workspaceId}/calendar-sync/accounts/${id}/busy`, {
        method: 'PATCH',
        body: JSON.stringify({ countsAsBusy }),
      }),
    onSuccess: refresh,
    onError: fail,
  })
  const disconnect = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/calendar-sync/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('plannerAccounts.disconnected'))
      await refresh()
    },
    onError: fail,
  })

  const accounts = query.data ?? []

  return (
    <div className="space-y-4" data-testid="planner-settings-accounts">
      <div>
        <h3 className="text-sm font-semibold">{t('plannerAccounts.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('plannerAccounts.subtitle')}</p>
      </div>

      {query.isPending ? (
        /* §2.9a — the shape of what is coming, never the word. */
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md border border-border bg-muted/30" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="p-4 text-center" data-testid="planner-accounts-empty">
          <p className="text-sm text-muted-foreground">{t('plannerAccounts.none')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('plannerAccounts.noneHint')}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} data-testid="planner-account-row">
              <Card className="p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.externalAccountEmail ?? t('plannerAccounts.unnamed')}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {PROVIDER_LABEL[a.provider] ?? a.provider}
                      {a.status === 'connected' && ` · ${t('plannerAccounts.connected')}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="planner-account-disconnect"
                    aria-label={t('plannerAccounts.disconnect')}
                    title={t('plannerAccounts.disconnect')}
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(a.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {/*
                    Default is a RADIO in behaviour even though it is drawn as a
                    button: choosing one takes it from the other, which is why
                    the current default is shown as a state rather than as a
                    control that could be switched off into nothing.
                  */}
                  {a.isDefault ? (
                    <span
                      data-testid="planner-account-default-on"
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-500"
                    >
                      <Check className="h-3 w-3" />
                      {t('plannerAccounts.isDefault')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px]"
                      data-testid="planner-account-make-default"
                      disabled={setDefault.isPending}
                      onClick={() => setDefault.mutate(a.id)}
                    >
                      {t('plannerAccounts.makeDefault')}
                    </Button>
                  )}

                  <button
                    type="button"
                    data-testid="planner-account-busy"
                    aria-pressed={a.countsAsBusy}
                    disabled={setBusy.isPending}
                    onClick={() => setBusy.mutate({ id: a.id, countsAsBusy: !a.countsAsBusy })}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                      a.countsAsBusy
                        ? 'border-accent/40 bg-accent/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('plannerAccounts.countsAsBusy')}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/*
        "+ Add account" goes to the existing integrations connect flow, which is
        where the OAuth grant is done. It is a link rather than a second flow so
        there is one place that talks to Google — and the callback now records
        the grant as this person's own account, which is what makes pressing it
        twice add a second calendar instead of replacing the first.
      */}
      <a
        href={`/app/${workspaceId}/settings?tab=integrations`}
        data-testid="planner-account-add"
        className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        {t('plannerAccounts.add')}
      </a>

      <p className="text-[11px] text-muted-foreground">{t('plannerAccounts.busyHint')}</p>
    </div>
  )
}
