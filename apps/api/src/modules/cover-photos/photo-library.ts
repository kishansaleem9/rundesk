/**
 * THE STOCK PHOTO LIBRARY A COVER'S SEARCH TAB SEARCHES (`commit-log/log-601eacc-1`,
 * `ledger-rows/row-739`).
 *
 * ClickUp's covers have "Search images", a large library of free stock photos,
 * beside Gallery, Upload and Link. The library here is Unsplash's: its base
 * address from UNSPLASH_API_URL (the lanes and CI point it at
 * `scripts/e2e-lanes/media-stub.mjs`), its key from UNSPLASH_ACCESS_KEY. With no
 * key the search is not set up, and the tab says so rather than drawing a box
 * that finds nothing — which is what the tab was before it was taken out.
 *
 * Unsplash's terms, kept here: a photo is shown from the address Unsplash gives
 * (hotlinked, never copied), the photographer and Unsplash are credited with
 * links that carry the app's referral (`utm_source`), and using a photo triggers
 * its download endpoint.
 *
 * Plain functions over a base address and a key, so `check-media-stub.mjs`
 * drives exactly what the API calls.
 */

export type PhotoLibraryConfig = { base: string; key: string }

export type LibraryPhoto = {
  id: string
  description: string
  /** What a result draws: the small rendition. */
  thumbUrl: string
  /** What a cover is set to: the regular rendition, hotlinked. */
  url: string
  width: number
  height: number
  color: string | null
  author: { name: string; url: string }
  /** The photo's own page at Unsplash, with the referral. */
  pageUrl: string
}

export type PhotoPage = { photos: LibraryPhoto[]; page: number; totalPages: number; total: number }

/** Not set up: no key on this server. */
export class PhotoLibraryUnset extends Error {}
/** The library answered with a refusal or not at all; `status` is its own, 0 when nothing came back. */
export class PhotoLibraryFailed extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export const PHOTOS_PER_PAGE = 24
export const PHOTO_QUERY_MAX = 100
/** Unsplash's ids are short base64url words. */
export const PHOTO_ID = /^[A-Za-z0-9_-]{6,32}$/
export const REFERRAL = 'utm_source=rundesk&utm_medium=referral'

const withReferral = (href: string) => `${href}${href.includes('?') ? '&' : '?'}${REFERRAL}`

export function photoLibraryConfig(env: Record<string, string | undefined> = process.env): PhotoLibraryConfig | null {
  const key = env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) return null
  const base = (env.UNSPLASH_API_URL?.trim() || 'https://api.unsplash.com').replace(/\/+$/, '')
  return { base, key }
}

type UnsplashPhoto = {
  id: string
  width?: number
  height?: number
  color?: string | null
  description?: string | null
  alt_description?: string | null
  urls?: { regular?: string; small?: string; thumb?: string }
  links?: { html?: string }
  user?: { name?: string; username?: string; links?: { html?: string } }
}

/** One of Unsplash's photos as a result; null for one with nothing to draw. */
export function toLibraryPhoto(p: UnsplashPhoto): LibraryPhoto | null {
  const url = p.urls?.regular
  const thumbUrl = p.urls?.small ?? p.urls?.thumb ?? url
  if (!p.id || !url || !thumbUrl) return null
  const name = p.user?.name?.trim() || p.user?.username || 'Unsplash'
  const authorPage = p.user?.links?.html ?? (p.user?.username ? `https://unsplash.com/@${p.user.username}` : 'https://unsplash.com')
  return {
    id: p.id,
    description: (p.description ?? p.alt_description ?? '').trim(),
    thumbUrl,
    url,
    width: p.width ?? 0,
    height: p.height ?? 0,
    color: p.color ?? null,
    author: { name, url: withReferral(authorPage) },
    pageUrl: withReferral(p.links?.html ?? `https://unsplash.com/photos/${p.id}`),
  }
}

async function ask(cfg: PhotoLibraryConfig, path: string, timeoutMs = 8000): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${cfg.base}${path}`, {
      headers: { authorization: `Client-ID ${cfg.key}`, 'accept-version': 'v1' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new PhotoLibraryFailed(0, 'The photo library did not answer')
  }
  if (!res.ok) throw new PhotoLibraryFailed(res.status, `The photo library refused the search (${res.status})`)
  return res.json().catch(() => {
    throw new PhotoLibraryFailed(res.status, 'The photo library answered with something that is not a list of photos')
  })
}

/** A page of the photos the library holds for these words, landscape first as a cover is. */
export async function searchPhotos(cfg: PhotoLibraryConfig, query: string, page = 1, perPage = PHOTOS_PER_PAGE): Promise<PhotoPage> {
  const params = new URLSearchParams({ query, page: String(page), per_page: String(perPage), orientation: 'landscape', content_filter: 'high' })
  const body = (await ask(cfg, `/search/photos?${params}`)) as { total?: number; total_pages?: number; results?: UnsplashPhoto[] }
  if (!Array.isArray(body?.results)) throw new PhotoLibraryFailed(200, 'The photo library answered with something that is not a list of photos')
  return {
    photos: body.results.map(toLibraryPhoto).filter((p): p is LibraryPhoto => p !== null),
    page,
    totalPages: Number(body.total_pages ?? 0),
    total: Number(body.total ?? 0),
  }
}

/** Unsplash's rule: a photo put to use triggers its download endpoint. */
export async function trackPhotoUse(cfg: PhotoLibraryConfig, id: string): Promise<void> {
  await ask(cfg, `/photos/${encodeURIComponent(id)}/download`)
}
