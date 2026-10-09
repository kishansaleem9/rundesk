/**
 * THE LANE'S PHOTO LIBRARY, as a suite reaches it — in one place, as the
 * calendars' address is (`lib/calendar.mjs`). Lane k runs its API on 302k and
 * its media stub (`scripts/e2e-lanes/media-stub.mjs`) on 95k; CI sets
 * `E2E_MEDIA_PORT` once, at job level.
 *
 * The library is the same fixed set of photos on every lane. What a run
 * changes there is which photos were reported used and whether the next calls
 * fail; a suite resets both when it starts and when it ends.
 */

/** Where the stub listens: `--media`, then `E2E_MEDIA_PORT`, then the lane formula. */
export function mediaBase(apiPort, override) {
  const port = Number(override ?? process.env.E2E_MEDIA_PORT ?? 9500 + (apiPort - 3020))
  return `http://127.0.0.1:${port}`
}

const post = async (base, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`the media stub answered ${res.status} to ${path}`)
  return res.json()
}

/** The photos reported used since the last reset, in order: `[{ id, at }]`. */
export async function photoDownloads(base) {
  const res = await fetch(`${base}/__control/photos/downloads`)
  if (!res.ok) throw new Error(`the media stub answered ${res.status} to its downloads`)
  return (await res.json()).downloads
}

/** The next `count` calls to the library answer `status`. */
export const failPhotos = (base, status, count = 1) => post(base, '/__control/photos/fail', { status, count })

/** Forget the downloads and any staged failure. */
export const resetPhotos = (base) => post(base, '/__control/photos/reset')
