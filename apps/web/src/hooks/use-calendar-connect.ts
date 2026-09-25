import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from '@rundesk/ui'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export type CalendarProvider = 'gcal' | 'outlook'
export const CALENDAR_PROVIDERS: readonly CalendarProvider[] = ['gcal', 'outlook']

/**
 * CONNECTING A CALENDAR — one flow for every place that offers it: the
 * planner's onboarding panel and its Accounts page ("Add account").
 *
 * `canConnect` is the server's own answer (`providers/status`, under the key
 * the Zoom row reads): `null` until it arrives, `false` for a calendar this
 * server has no keys for, whose button would lead to a consent page for no
 * application (`ledger-rows/defect-planner-connect-empty-consent`). `connect`
 * asks for the provider's consent address and goes there.
 *
 * The Accounts page's "Add account" was a link to Settings → Integrations,
 * which connects no calendar and sends a member back to the start.
 */
export function useCalendarConnect(workspaceId: string) {
  const { t } = useTranslation()
  const { data: providerStatus } = useQuery({
    queryKey: ['integration-provider-status', workspaceId],
    queryFn: () =>
      api<Array<{ provider: string; available: boolean; missingEnvKeys?: string[] }>>(
        `/workspaces/${workspaceId}/integrations/connections/providers/status`,
      ),
    enabled: !!workspaceId,
  })
  const canConnect = (provider: CalendarProvider): boolean | null =>
    providerStatus === undefined ? null : (providerStatus.find((p) => p.provider === provider)?.available ?? false)

  /*
   * THE PERSON'S OWN GRANT, not the workspace's: a calendar is a personal
   * connection, asked of membership and written to this person's account alone
   * (`found-24-sep/personal-calendar-connect-needs-integrations-manage`). The
   * workspace's `oauth/start` asked `integrations.manage`, so a member was
   * offered Connect and refused, and an admin's calendar became the
   * workspace's. It lands back on the Accounts page, or says there why not.
   */
  const connect = useMutation({
    mutationFn: (provider: CalendarProvider) =>
      api<{ authUrl: string }>(`/workspaces/${workspaceId}/calendar-sync/connect/${provider}`, { method: 'POST' }),
    onSuccess: ({ authUrl }) => {
      window.location.href = authUrl
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : t('planner.onboarding.connectFailed'))
    },
  })

  return { canConnect, connect }
}
