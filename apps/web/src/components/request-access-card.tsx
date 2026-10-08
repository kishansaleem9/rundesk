import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Lock, Check } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'

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
 * Rendered ONLY on a 403. That distinction is doing real work: the resource
 * guard throws 403 for an object that exists and 404 for one that does not, so
 * a request button on a 404 would confirm the existence of things the caller
 * was never told about — the reverse of what the private flag is for.
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
  /** The failure that produced this screen. Anything but a 403 renders nothing. */
  error: unknown
}) {
  const { t } = useTranslation()
  const [asked, setAsked] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  const request = useMutation({
    mutationFn: () =>
      api(`/shares/${type}/${objectId}/request`, {
        method: 'POST',
        body: { workspaceId },
      }),
    /*
     * The confirmation is the same whatever success comes back.
     *
     * The server distinguishes 'sent' from 'already_asked' from 'no_owners',
     * and showing those apart would leak how the object is owned to somebody
     * who cannot see the object. "We passed it on" is true of all three and
     * tells the requester the one thing they need. A refusal passed nothing on
     * — an hour's worth of asks already made, or nothing there to ask about
     * (`found-30-sep/access-asks-from-outside-the-workspace`) — so it is said in its
     * own words, not as sent.
     */
    onSuccess: () => setAsked(true),
    onError: (err) => setRefused(err instanceof ApiError ? err.message : t('requestAccess.failed')),
  })

  if (!(error instanceof ApiError) || error.status !== 403) return null
  if (!workspaceId || !objectId) return null

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
      {refused ? (
        <span className="text-xs text-destructive" data-testid="request-access-refused">
          {refused}
        </span>
      ) : asked ? (
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
