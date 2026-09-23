import { api, ApiError } from './api'
import { useAuthStore } from '../store/auth'

/**
 * SIGNING OUT, ONE WAY, FROM EVERY PLACE THAT OFFERS IT.
 *
 * The endpoint is always called: it clears the httpOnly cookies and revokes
 * the refresh session, and a cookie session has no refresh token in the store
 * to send — the server reads the cookie. There were two copies of this. The
 * super-admin console's called the endpoint only when a refresh token was
 * stored, so from a cookie session it never called it: measured on
 * 23 September, `/auth/refresh` with the cookies left behind answered 200 — a
 * fresh session — after "Sign out", where the topbar's answered 401.
 *
 * The store is cleared whatever the server says (and that deletes the API cache
 * an older service worker kept — see `api-cache.ts`); the caller navigates.
 */
export async function signOut(): Promise<void> {
  const { refreshToken, clear } = useAuthStore.getState()
  try {
    await api('/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    })
  } catch (err) {
    if (!(err instanceof ApiError)) console.error(err)
  } finally {
    clear()
  }
}
