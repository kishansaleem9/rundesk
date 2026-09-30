/**
 * `/clips/<token>` — WHAT A CLIP'S LINK OPENS (`resume-defects/resume-7`).
 *
 * Copy link and New tab on a clip used to hand out the signed storage URL, and
 * it died a day later with nothing having said so. ClickUp's clip link is an
 * unguessable address anyone holding it can open, kept until the clip is
 * deleted. This page is that address: it asks `GET /public/clips/:token` for
 * the clip, which signs the storage object again on every view, and plays it.
 *
 * WHO GETS IN is the server's decision, not this page's: anyone, unless the
 * clip's workspace blocks public sharing, and then its members, signed in. So
 * the request carries the session when there is one (cookie, and Bearer while
 * both exist), and the two refusals read differently: 401 asks for a sign-in
 * that would let the person in; 404 is a link that is not one, a clip that was
 * deleted, or a members-only clip and somebody who is not a member — told
 * apart for nobody, since a guess at which is which is a probe.
 *
 * AND A SIGNATURE THAT LAPSES UNDER AN OPEN PAGE is signed again: a long clip
 * paused past the window asks the store for the rest with a URL it now
 * refuses, and the player errors. The page asks for a fresh URL once and picks
 * up where it was; a second failure on the fresh URL is said, not retried.
 *
 * `resume-defects/s4-clip-link` (a pasted clip link that renders as the clip)
 * would recognise this route and read the same endpoint.
 */
import { useEffect, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@rundesk/ui'
import { Loader2, Lock, Video } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useTranslation } from '../lib/i18n'
import { formatDuration } from '../lib/composer-recording'
import type { ClipLinkAudience } from '../lib/clip-publish'

const route = getRouteApi('/clips/$token')

type ClipView = {
  title: string
  durationSeconds: number
  contentType: string
  createdAt: string | null
  /** Signed for `expiresInSeconds` when this answer was made; the link is not. */
  url: string
  expiresInSeconds: number
  audience: ClipLinkAudience
}

export function ClipLinkPage() {
  const { t } = useTranslation()
  const { token } = route.useParams()
  const view = useQuery({
    queryKey: ['clip-link', token],
    queryFn: () => api<ClipView>(`/public/clips/${encodeURIComponent(token)}`),
    retry: false,
    // Every view signs again: an answer kept in the cache holds a signature
    // that may already have lapsed.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  const [src, setSrc] = useState<string | null>(null)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  /** The URL a re-sign was already asked for, so a clip that cannot play is not asked for forever. */
  const resignedFrom = useRef<string | null>(null)
  const resumeAt = useRef<number | null>(null)

  useEffect(() => {
    if (view.data?.url) setSrc(view.data.url)
  }, [view.data?.url])

  const onPlayerError = async (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const failedSrc = event.currentTarget.getAttribute('src')
    if (!failedSrc || resignedFrom.current === failedSrc) {
      setPlaybackFailed(true)
      return
    }
    resignedFrom.current = failedSrc
    resumeAt.current = event.currentTarget.currentTime || null
    const fresh = await view.refetch()
    if (fresh.data?.url && fresh.data.url !== failedSrc) setSrc(fresh.data.url)
    else setPlaybackFailed(true)
  }

  if (view.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t('clipLink.loading')}
      </div>
    )
  }

  if (view.isError || !view.data) {
    const signIn = view.error instanceof ApiError && view.error.status === 401
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div
          className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3"
          data-testid={signIn ? 'clip-link-sign-in' : 'clip-link-unavailable'}
        >
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {signIn ? <Lock className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </div>
          <h1 className="text-lg font-display font-semibold">
            {signIn ? t('clipLink.signIn') : t('clipLink.unavailable')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {signIn ? t('clipLink.signInBody') : t('clipLink.unavailableBody')}
          </p>
          {signIn && (
            <Button asChild>
              {/* Back here once signed in: the login page follows `next` to a path on this site. */}
              <a href={`/login?next=${encodeURIComponent(`/clips/${token}`)}`} data-testid="clip-link-sign-in-action">
                {t('clipLink.signInAction')}
              </a>
            </Button>
          )}
        </div>
      </div>
    )
  }

  const clip = view.data
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-2xl font-display font-semibold break-words" data-testid="clip-link-title">
          {clip.title}
        </h1>
        <video
          data-testid="clip-link-player"
          src={src ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-lg bg-black aspect-video"
          onLoadedMetadata={(event) => {
            // Where the player was when its signature lapsed.
            if (resumeAt.current !== null) {
              event.currentTarget.currentTime = resumeAt.current
              resumeAt.current = null
            }
          }}
          onError={(event) => void onPlayerError(event)}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {clip.durationSeconds > 0 && (
            <span className="tabular-nums" data-testid="clip-link-duration">
              {formatDuration(clip.durationSeconds)}
            </span>
          )}
          {clip.createdAt && (
            <span>{t('clipLink.recorded', { date: new Date(clip.createdAt).toLocaleDateString() })}</span>
          )}
        </div>
        {playbackFailed && (
          <p className="text-sm text-rose-500" data-testid="clip-link-playback-failed">
            {t('clipLink.playbackFailed')}
          </p>
        )}
      </div>
    </div>
  )
}
