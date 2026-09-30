import { createHash } from 'node:crypto'

/**
 * One-way hash of a refresh token for storage/lookup.
 *
 * Only this SHA-256 digest is ever persisted in `sessions.refreshToken` — never
 * the raw signed JWT — so read access to the DB no longer yields directly-usable
 * refresh tokens. The raw JWT is still handed back to the client (response body
 * + httpOnly cookie); only the stored copy is hashed. Lookups hash the incoming
 * token the same way and match on the digest. The column stays `text` (a hex
 * digest fits), so this needs no schema migration.
 *
 * HERE, not in `auth.service.ts` (which re-exports it), so the profile's
 * password change can name the session that asked
 * (`found-30-sep/password-change-unthrottled`): `users.service.ts` importing
 * `auth.service.ts` would be a cycle, since the auth service imports the users
 * service, and whichever loaded first would see the other half-made.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
