/**
 * THE COVER PICKER'S SEARCH TAB (`commit-log/log-601eacc-1`, `ledger-rows/row-739`).
 *
 * ClickUp's covers have "Search images": a large library of free stock photos,
 * beside Gallery, Upload and Link. This searches Unsplash's through the API
 * (`GET /workspaces/:ws/cover-photos`), a page at a time, and a photo chosen
 * becomes the cover's link, hotlinked as Unsplash asks — and is reported used,
 * which Unsplash also asks. Each result credits its photographer and Unsplash,
 * with links.
 *
 * WHAT IT SAYS WHEN IT CANNOT: a server with no key for the library says photo
 * search is not set up there (503), and a library that did not answer says so
 * — never an empty grid that reads as "no photos of mountains exist".
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, Input } from '@rundesk/ui'
import { Search, Loader2 } from 'lucide-react'
import { api, ApiError, refusalMessage } from '../lib/api'
import { useTranslation } from '../lib/i18n'

export type LibraryPhoto = {
  id: string
  description: string
  thumbUrl: string
  url: string
  width: number
  height: number
  color: string | null
  author: { name: string; url: string }
  pageUrl: string
}
type PhotoPage = { photos: LibraryPhoto[]; page: number; totalPages: number; total: number }

const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=rundesk&utm_medium=referral'

export function CoverPhotoSearch({
  workspaceId,
  onChoose,
}: {
  workspaceId: string | undefined
  onChoose: (photo: LibraryPhoto) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  // A search per pause in the typing, not per key.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300)
    return () => clearTimeout(id)
  }, [text])

  const results = useInfiniteQuery({
    queryKey: ['cover-photos', workspaceId, query],
    enabled: Boolean(workspaceId) && query.length > 0,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<PhotoPage>(`/workspaces/${workspaceId}/cover-photos?q=${encodeURIComponent(query)}&page=${pageParam}`),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const photos = results.data?.pages.flatMap((p) => p.photos) ?? []

  const choose = (photo: LibraryPhoto) => {
    // Unsplash's rule: a photo put to use is reported. The cover does not wait on it.
    void api(`/workspaces/${workspaceId}/cover-photos/${encodeURIComponent(photo.id)}/use`, { method: 'POST' }).catch(() => {})
    onChoose(photo)
  }

  let body: ReactNode
  if (!query) {
    body = <p className="py-8 text-center text-sm text-muted-foreground" data-testid="cover-search-hint">{t('coverImage.searchHint')}</p>
  } else if (results.isPending) {
    body = (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3" aria-busy="true" aria-live="polite" data-testid="cover-search-loading">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-[5/3] animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    )
  } else if (results.isError && photos.length === 0) {
    const err = results.error
    const unset = err instanceof ApiError && err.status === 503
    body = unset ? (
      <p className="py-8 text-center text-sm text-muted-foreground" data-testid="cover-search-unavailable">{t('coverImage.searchUnavailable')}</p>
    ) : (
      <p className="py-8 text-center text-sm text-red-600" data-testid="cover-search-error">
        {refusalMessage(err, t('coverImage.searchFailed'))}
      </p>
    )
  } else if (photos.length === 0) {
    body = <p className="py-8 text-center text-sm text-muted-foreground" data-testid="cover-search-empty">{t('coverImage.searchEmpty', { query })}</p>
  } else {
    body = (
      <>
        <div className="grid max-h-[320px] grid-cols-2 gap-2 overflow-auto md:grid-cols-3" data-testid="cover-search-results">
          {photos.map((photo) => (
            <figure key={photo.id} className="space-y-0.5">
              <button
                type="button"
                data-testid="cover-search-result"
                data-photo-id={photo.id}
                onClick={() => choose(photo)}
                title={photo.description}
                className="relative block aspect-[5/3] w-full overflow-hidden rounded-lg border-2 border-transparent transition-all hover:border-accent"
                style={{ background: photo.color ?? undefined }}
              >
                <img src={photo.thumbUrl} alt={photo.description} loading="lazy" className="h-full w-full object-cover" />
              </button>
              <figcaption className="truncate text-[10px] text-muted-foreground" data-testid="cover-search-credit">
                <Credit template={t('coverImage.photoCredit')} author={photo.author} />
              </figcaption>
            </figure>
          ))}
        </div>
        {results.hasNextPage && (
          <div className="mt-2 flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              data-testid="cover-search-more"
              disabled={results.isFetchingNextPage}
              onClick={() => void results.fetchNextPage()}
            >
              {results.isFetchingNextPage && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t('coverImage.searchMore')}
            </Button>
          </div>
        )}
        {results.isFetchNextPageError && (
          <p className="mt-1 text-center text-xs text-red-600" data-testid="cover-search-error">
            {refusalMessage(results.error, t('coverImage.searchFailed'))}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        leadingIcon={<Search className="h-4 w-4" />}
        placeholder={t('coverImage.searchPlaceholder')}
        value={text}
        autoFocus
        data-testid="cover-search-input"
        onChange={(e) => setText(e.target.value)}
        maxLength={100}
      />
      {body}
    </div>
  )
}

/** "Photo by {{name}} on {{site}}", with the photographer and Unsplash as links, in the locale's own order. */
function Credit({ template, author }: { template: string; author: { name: string; url: string } }) {
  return (
    <>
      {template.split(/(\{\{name\}\}|\{\{site\}\})/).map((part, i) =>
        part === '{{name}}' ? (
          <a key={i} href={author.url} target="_blank" rel="noreferrer noopener" className="underline" data-testid="cover-search-author">
            {author.name}
          </a>
        ) : part === '{{site}}' ? (
          <a key={i} href={UNSPLASH_HOME} target="_blank" rel="noreferrer noopener" className="underline" data-testid="cover-search-site">
            Unsplash
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
