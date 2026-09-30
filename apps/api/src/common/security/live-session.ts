import { eq } from 'drizzle-orm'
import { sessions } from '@rundesk/db'
import type { Db } from '@rundesk/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * WHETHER AN ACCESS TOKEN'S SESSION IS STILL LIVE
 * (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
 *
 * An access token is good for fifteen minutes and was checked for its
 * signature alone, so a session revoked by a password change, a reset, "sign
 * out other sessions", revoking it, signing out or the concurrent-session cap
 * went on reading until its token ran out: measured on lane 3, every one of
 * the six answered `GET /users/me` 200 after its session was revoked. OWASP's
 * ASVS 5.0, 7.4.1: when a session is terminated "the application disallows
 * any further use of the session … Applications using self-contained tokens
 * will need a solution such as maintaining a list of terminated tokens,
 * disallowing tokens produced before a per-user date and time or rotating a
 * per-user signing key."
 *
 * The token names its session (`sid`, `AuthService.login`), and the session's
 * row says whether it is live: not revoked, not past its window, and the
 * token's own person's. A per-account "tokens before this time are void" would
 * cost the same read (the account's row) and could not end one session of
 * several: revoking one session, the session cap and signing out would void
 * the person's every other session with it. So one read by primary key per
 * request (0.04 ms in Postgres on lane 3's 9,739 sessions), and no cache: a
 * cached answer is a revoked session still reading until it expires, on each
 * replica apart, which is what this ends.
 *
 * A token that names no session is refused: every token is made naming one,
 * so such a token was made before this, and its client refreshes (the web does
 * on any 401), which names one. False, never a throw, for anything else that
 * is not a live session, a malformed id among them.
 */
export async function sessionIsLive(
  db: Db,
  claims: { sub?: unknown; sid?: unknown } | null | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  const sid = claims?.sid
  const sub = claims?.sub
  if (typeof sid !== 'string' || !UUID.test(sid) || typeof sub !== 'string' || sub.length === 0) return false
  const [row] = await db
    .select({ userId: sessions.userId, isRevoked: sessions.isRevoked, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.id, sid))
    .limit(1)
  return !!row && row.userId === sub && !row.isRevoked && new Date(row.expiresAt) > now
}
