/**
 * WHERE AN ADDRESS IS, for a list's Map view (`commit-log/log-68bc188-1`,
 * `ledger-rows/row-777`).
 *
 * ClickUp places a task on its Map by the address in a Location field, which
 * it searches through Google Maps. Rundesk asks a geocoder in Nominatim's
 * (OpenStreetMap's) shape — `GET <GEOCODER_URL>?q=<address>&format=json&limit=1`
 * answering `[{ lat, lon }]` — at the address an operator gives, with
 * GEOCODER_KEY sent as `key` where theirs needs one. The tiles the map is drawn
 * from come from MAP_TILES_URL, a `{z}/{x}/{y}` template the browser fills.
 *
 * With no geocoder set an address is kept as it was typed and placed nowhere:
 * the Map says so rather than guessing, and makes no request on its behalf.
 */

export type Point = { lat: number; lng: number }

export function geocoderConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GEOCODER_URL?.trim())
}

/** The tile template the browser fills, or null where none is set. */
export function mapTilesTemplate(env: NodeJS.ProcessEnv = process.env): string | null {
  const t = env.MAP_TILES_URL?.trim()
  return t && t.includes('{z}') && t.includes('{x}') && t.includes('{y}') ? t : null
}

/**
 * The point an address names, or null when the geocoder is not set, cannot
 * place it, or does not answer in time. Never throws: a field's value is saved
 * whether or not its place is found.
 */
export async function geocode(address: string, env: NodeJS.ProcessEnv = process.env): Promise<Point | null> {
  const base = env.GEOCODER_URL?.trim()
  const q = address.trim()
  if (!base || !q) return null
  const url = new URL(base)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  if (env.GEOCODER_KEY?.trim()) url.searchParams.set('key', env.GEOCODER_KEY.trim())
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'Rundesk geocoder' } })
    if (!res.ok) return null
    const body = (await res.json()) as Array<{ lat?: unknown; lon?: unknown }>
    const hit = Array.isArray(body) ? body[0] : null
    const lat = Number(hit?.lat)
    const lng = Number(hit?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { lat, lng }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
