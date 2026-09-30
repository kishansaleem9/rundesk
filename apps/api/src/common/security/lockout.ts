import { HttpException, HttpStatus } from '@nestjs/common'
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { users } from '@rundesk/db'
import type { Db } from '@rundesk/db'

/** The lockout's numbers, from the account's workspace policy (`getEffectiveForUser`). */
export type LockoutPolicy = { lockoutThreshold: number; lockoutDurationMinutes: number }

/**
 * ONE WRONG PASSWORD, COUNTED IN ONE STATEMENT
 * (`found-30-sep/lockout-counts-overlapping-attempts-once`), wherever a
 * password is guessed: at sign-in (`AuthService.validateUser`), and at a
 * password change, whose current password is the same secret
 * (`found-30-sep/password-change-guesses-600-an-hour`). Here, not in the auth
 * service, so the users service counts with the same statement: it cannot
 * import the auth service, which imports it.
 *
 * The count was read with the account and written back plus one, so wrong
 * passwords that overlapped each wrote the same next number. Measured on
 * lane 3: four sent at once left `failed_login_attempts` at 1, and five or
 * eight at once at 1 too; one after another, the account locked only at its
 * eighth wrong password, where the policy says five. So the number of
 * guesses the lockout allowed grew with how many an attacker sends at once,
 * from as many addresses as sign-in's ten a minute per address needs.
 *
 * Postgres adds the one now, to the number the row holds when this UPDATE
 * takes its lock: attempts that overlap wait for each other and each is
 * counted. The one that reaches the threshold locks the account in the same
 * statement and starts the count again, as the policy always did. An attempt
 * that finds the account already locked is not counted, as a locked
 * account's sign-in never was (it is refused before its compare is read):
 * eight at once lock it at the fifth and leave nothing counted past it.
 * Answers the count and the lock as the statement left them, or null when it
 * counted nothing (the account was locked, by this attempt's neighbours).
 */
export async function countWrongPassword(db: Db, userId: string, policy: LockoutPolicy, now: Date) {
  const lockedUntil = new Date(now.getTime() + policy.lockoutDurationMinutes * 60_000)
  const reachesThreshold = sql`${users.failedLoginAttempts} + 1 >= ${policy.lockoutThreshold}`
  const [counted] = await db
    .update(users)
    .set({
      failedLoginAttempts: sql`case when ${reachesThreshold} then 0 else ${users.failedLoginAttempts} + 1 end`,
      lockedUntil: sql`case when ${reachesThreshold} then ${lockedUntil.toISOString()}::timestamptz else ${users.lockedUntil} end`,
    })
    .where(and(eq(users.id, userId), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))
    .returning({ failedLoginAttempts: users.failedLoginAttempts, lockedUntil: users.lockedUntil })
  return counted ?? null
}

/**
 * When the account's lock lifts, if the policy locks accounts and this one is
 * locked now; otherwise null. The row's `locked_until` outlives its lock (it is
 * cleared by the next right password, not when it passes), so a time already
 * past is no lock.
 */
export function lockedUntilNow(
  account: { lockedUntil: Date | string | null | undefined },
  policy: { lockoutEnabled: boolean },
  now: Date,
): Date | null {
  if (!policy.lockoutEnabled || !account.lockedUntil) return null
  const until = new Date(account.lockedUntil)
  return until > now ? until : null
}

/**
 * A REFUSAL THAT SAYS THE ACCOUNT IS LOCKED, for a caller signed in as the
 * account (a password change), whom the lock tells nothing new. Sign-in never
 * says so: there it would tell a stranger that the email has an account, so a
 * locked account's sign-in is the generic "Invalid credentials".
 *
 * 423 Locked, not 429: the limiter's 429 is about requests, and this is about
 * the account, whose lock applies to sign-in too. The body carries when it
 * lifts, `lockedUntil`, and `retryAfter` in whole seconds, as the limiter's
 * refusal does.
 */
export function accountLocked(until: Date, now: Date, lead: string): HttpException {
  const seconds = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000))
  const minutes = Math.ceil(seconds / 60)
  return new HttpException(
    {
      error: 'account_locked',
      message: `${lead} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
      lockedUntil: until.toISOString(),
      retryAfter: seconds,
    },
    HttpStatus.LOCKED,
  )
}
