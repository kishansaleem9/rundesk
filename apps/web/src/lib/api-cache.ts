/**
 * THE SERVICE WORKER NO LONGER KEEPS API ANSWERS, AND THIS DELETES WHAT IT KEPT.
 *
 * `vite.config.ts` used to send every `GET /api/v1/*` through `NetworkFirst`
 * into this cache, keyed by URL alone and kept for a day. Measured on
 * 23 September: signed in as the super admin, it held `/users/me` (with the
 * email), `/ops/metrics`, `/ops/tenant-databases` and the organisation's
 * workspaces, and after sign-out all eleven answers were still there — so the
 * next person on the same browser was answered from the previous person's data
 * whenever a request took longer than five seconds, and anyone with the
 * profile could read it off disk.
 *
 * The rule is gone. A worker installed before it went keeps writing here until
 * the new one takes over, so the cache is deleted at start-up and again at
 * every sign-out.
 */
export const API_CACHE = 'rundesk-api'

export async function dropApiCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(API_CACHE).catch(() => false)
}
