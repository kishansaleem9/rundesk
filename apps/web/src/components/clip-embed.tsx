/**
 * A CLIP'S LINK, DRAWN AS THE CLIP (`resume-defects/s4-clip-link`,
 * `ledger-rows/row-1307`).
 *
 * A clip's link pasted into a chat message, a comment or a task's description
 * stayed a bare address: no title, no player. ClickUp embeds it where it is
 * shared — "Clip links auto-embed in Chat for instant viewing", and a clip
 * embedded in a task's description plays there. Under the text, each of its
 * clips (`clip-links.ts`) is drawn as a card: the title, a player and its
 * length, and the link to open it on its own page.
 *
 * WHAT IT PLAYS IS WHAT THE LINK OPENS: `GET /public/clips/:token`, the link's
 * own page's question, signed again on every ask, so a clip opens here for
 * exactly whom its link opens — anyone where its workspace allows public
 * links, its members where it does not — and a deleted clip, or one this reader
 * may not watch, is said, not drawn as a broken player. A signature that lapses
 * under an open card is asked for again once, as the clip's page does.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, Video } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { formatDuration } from '../lib/composer-recording'

type ClipView = { title: string; durationSeconds: number; url: string }

export function ClipEmbed({ token }: { token: string }) {
  const { t } = useTranslation()
  const view = useQuery({
    queryKey: ['clip-embed', token],
    queryFn: () => api<ClipView>(`/public/clips/${encodeURIComponent(token)}`),
    retry: false,
    // A cached answer holds a signature that may already have lapsed.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const resignedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (view.data?.url) setSrc(view.data.url)
  }, [view.data?.url])

  const href = `/clips/${token}`
  if (view.isPending) {
    return <div className="mt-2 h-40 w-full max-w-md animate-pulse rounded-lg border border-border bg-muted/30" data-testid="clip-embed-loading" aria-busy="true" />
  }
  if (view.isError || !view.data) {
    const signIn = view.error instanceof ApiError && view.error.status === 401
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 flex max-w-md items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        data-testid="clip-embed-unavailable"
        data-clip-token={token}
      >
        {signIn ? <Lock className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
        {signIn ? t('clipEmbed.signIn') : t('clipEmbed.unavailable')}
      </a>
    )
  }
  const clip = view.data
  return (
    <div
      className="mt-2 max-w-md overflow-hidden rounded-lg border border-border bg-card"
      data-testid="clip-embed"
      data-clip-token={token}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        data-testid="clip-embed-player"
        src={src ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black"
        onError={async (event) => {
          const failedSrc = event.currentTarget.getAttribute('src')
          if (!failedSrc || resignedFrom.current === failedSrc) {
            setFailed(true)
            return
          }
          resignedFrom.current = failedSrc
          const fresh = await view.refetch()
          if (fresh.data?.url && fresh.data.url !== failedSrc) setSrc(fresh.data.url)
          else setFailed(true)
        }}
      />
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <a href={href} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate font-medium hover:underline" data-testid="clip-embed-title">
          {clip.title}
        </a>
        {clip.durationSeconds > 0 && (
          <span className="tabular-nums text-muted-foreground" data-testid="clip-embed-duration">{formatDuration(clip.durationSeconds)}</span>
        )}
      </div>
      {failed && <p className="px-3 pb-2 text-xs text-rose-500" data-testid="clip-embed-failed">{t('clipLink.playbackFailed')}</p>}
    </div>
  )
}

/** Each clip a text links to, drawn under it. */
export function ClipEmbeds({ tokens }: { tokens: string[] }) {
  if (tokens.length === 0) return null
  return (
    <div className="space-y-2" data-testid="clip-embeds">
      {tokens.map((token) => (
        <ClipEmbed key={token} token={token} />
      ))}
    </div>
  )
}
