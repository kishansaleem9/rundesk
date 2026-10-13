import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useRetryAfter } from '../lib/use-retry-after'
import { PublicBusy } from '../components/public-busy'
import { DeckPager, type DeckSlide } from '../components/brain-artifacts'

export const Route = createFileRoute('/deck/$token')({
  component: PublicDeckViewer,
})

type PublicDeck = { kind: 'deck'; title: string; slides: DeckSlide[] }

/** Why the deck did not load: a link that no longer opens (404), too many asks (429), or a failure. */
class PublicDeckError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(status === 404 ? 'Not found' : 'Failed to load')
  }
}

const retryAfterOf = (res: Response) => {
  if (res.status !== 429) return null
  const seconds = Number(res.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 5
}

/**
 * A DECK BRAIN MADE, PUBLISHED TO A LINK (`ledger-rows/row-853`): ClickUp shares
 * an Artifact through a published link, and anybody with it reads it — its
 * title and slides, paged, and nothing about who made it or where. Unpublished,
 * the link says it no longer opens anything, as a revoked Doc link does.
 */
function PublicDeckViewer() {
  const { token } = Route.useParams() as { token: string }
  const deckQuery = useQuery({
    queryKey: ['public-deck', token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/public/artifacts/${encodeURIComponent(token)}`)
      if (!res.ok) throw new PublicDeckError(res.status, retryAfterOf(res))
      const body = (await res.json().catch(() => null)) as { data?: PublicDeck | null } | null
      if (!body?.data) throw new PublicDeckError(res.status)
      return body.data
    },
    retry: false,
  })

  const busyFor =
    !deckQuery.data && deckQuery.error instanceof PublicDeckError && deckQuery.error.status === 429 ? deckQuery.error.retryAfter : null
  const busyLeft = useRetryAfter(busyFor, deckQuery.errorUpdatedAt, () => void deckQuery.refetch())

  if (deckQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>
  }
  if (busyFor !== null) {
    return <PublicBusy seconds={busyLeft ?? busyFor} onRetry={() => void deckQuery.refetch()} testId="public-deck-busy" />
  }
  if (deckQuery.isError || !deckQuery.data) {
    const gone = deckQuery.error instanceof PublicDeckError && deckQuery.error.status === 404
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-2" data-testid={gone ? 'public-deck-not-found' : 'public-deck-failed'}>
        <h1 className="text-2xl font-display font-semibold">{gone ? 'Deck not found' : 'This deck could not be loaded'}</h1>
        <p className="text-sm text-muted-foreground">
          {gone ? 'This link may have been unpublished, or the deck deleted.' : 'Something went wrong while loading it. Try again in a moment.'}
        </p>
      </div>
    )
  }
  const deck = deckQuery.data
  return (
    <div className="min-h-screen bg-background" data-testid="public-deck">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <h1 data-testid="public-deck-title" className="text-3xl font-display font-semibold">
          {deck.title}
        </h1>
        <DeckPager slides={deck.slides} />
      </div>
    </div>
  )
}
