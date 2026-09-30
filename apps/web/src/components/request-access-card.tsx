import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Lock, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { offersRequestAccess } from './request-access-offer'

/** The object kinds the sharing API can grant access to. */
export type RequestableType =
  | 'space' | 'folder' | 'project' | 'list' | 'task' | 'doc' | 'channel' | 'dashboard'

/**
 * §G10 [12:16–12:20] — "ask the people who can grant it".
 *
 * The server side of this shipped alone: the endpoint, the table and the
 * fan-out to whoever holds admin all existed, and nothing in the app ever
 * called them. Hitting a private object was still a dead end that said
 * "not found" and stopped.
 *
 * Rendered on the 404 (`offersRequestAccess`), in words that do not say
 * whether anything is there. It was rendered only on a 403, back when the
 * resource guard answered 403 for an object that existed and 404 for one that
 * did not — so the card was itself the confirmation that the id named
 * something. Both are 404 now (`found-30-sep/private-task-reads-say-403`), and
 * the ask is recorded alike for both; only one about an object that is there
 * reaches anybody.
 */
export function RequestAccessCard({
  workspaceId,
  type,
  objectId,
  error,
}: {
  workspaceId: string | undefined
  type: RequestableType
  objectId: string | undefined
  /** The failure that produced this screen. Anything but a 404 renders nothing. */
  error: unknown
}) {
  const { t } = useTranslation()
  const [asked, setAsked] = useState(false)

  const request = useMutation({
    mutationFn: () =>
      api(`/shares/${type}/${objectId}/request`, {
        method: 'POST',
        body: { workspaceId },
      }),
    /*
     * Settled, not success: the confirmation is the same whatever comes back.
     *
     * The server distinguishes 'sent' from 'already_asked' from 'no_owners',
     * and showing those apart would leak how the object is owned to somebody
     * who cannot see the object. "We passed it on" is true of all three and
     * tells the requester the one thing they need.
     */
    onSettled: () => setAsked(true),
  })

  if (!offersRequestAccess(error, workspaceId, objectId)) return null

  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md border border-border/60 bg-card/60 p-4"
      data-testid="request-access-card"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        {t('requestAccess.title')}
      </div>
      <p className="text-xs text-muted-foreground">{t('requestAccess.body')}</p>
      {asked ? (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="request-access-sent"
        >
          <Check className="h-3.5 w-3.5" />
          {t('requestAccess.sent')}
        </span>
      ) : (
        <button
          type="button"
          data-testid="request-access-button"
          disabled={request.isPending}
          onClick={() => request.mutate()}
          className="inline-flex h-8 items-center rounded-md border border-border/70 px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:opacity-50"
        >
          {t('requestAccess.action')}
        </button>
      )}
    </div>
  )
}
