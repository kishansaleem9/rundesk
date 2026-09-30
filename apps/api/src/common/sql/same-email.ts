import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

/**
 * ONE EMAIL, IN ANY CASE (`found-30-sep/sign-in-reads-the-email-as-typed`).
 *
 * Sign-up stores an email in lower case, and so do Google's and Microsoft's
 * sign-in, SSO, SCIM and an invitation. Sign-in looked the account up with the
 * email exactly as the form sent it, so `Ada@…` was refused 401 for the
 * account `ada@…` made; adding a member by an email typed with a capital
 * answered "No user with email". The retired register route kept an email as
 * typed, so an account may be stored with capitals too: asked for in lower
 * case, sign-in refused it, forgot-password sent nothing, and sign-up made a
 * second account beside it (all measured on lane 3, 30 September).
 *
 * So every lookup of a person by email compares both sides in Postgres's lower
 * case, one function on both, whatever was typed and however it was stored.
 * OWASP's authentication cheat sheet: user names "should be case-insensitive",
 * and "email addresses are already case insensitive". `shares.service.ts`
 * already looked people up this way.
 *
 * `users.email`'s unique index is on the text as stored, so this reads the
 * table rather than the index: about 2 ms over lane 3's 2,602 accounts, where
 * the index answers in 0.15 ms (EXPLAIN ANALYZE, 30 September). An index on
 * `lower(email)` is a schema change of its own.
 */
export function sameEmail(column: AnyColumn, typed: string): SQL {
  return sql`lower(${column}) = lower(${typed.trim()})`
}

/**
 * Among the accounts `sameEmail` finds, the one stored exactly as typed first.
 * Two rows can differ in case only where the retired register route made one
 * beside another; each still signs in as it was typed, and any other spelling
 * finds the older (the caller orders by `createdAt` after this).
 */
export function storedAsTypedFirst(column: AnyColumn, typed: string): SQL {
  return sql`(${column} = ${typed.trim()}) desc`
}
