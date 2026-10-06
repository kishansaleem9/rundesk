# A WRONG PASSWORD IS COUNTED ON AN ACCOUNT ANOTHER ATTEMPT HAS JUST LOCKED, READ FROM THE STATEMENT (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# `sip-3`'s edit, claimed by the unit test: the UPDATE touches the account's
# row whether or not its lock has passed.
#
# Re-anchored 30 September: the statement moved to `common/security/lockout.ts`
# (`found-30-sep/password-change-guesses-600-an-hour`); the line and the edit
# are the same, and the auth service still counts with it.
#
# Re-anchored 5 October: `clearLockoutIfUnlocked`
# (`found-30-sep/a-burst-is-compared-before-the-lock`) added a second UPDATE
# with the same "not locked" WHERE, so the anchor now carries
# `countWrongPassword`'s own RETURNING to stay unique and aimed at its WHERE.
#
# Reddens: unit: auth.service.test.ts "a wrong password is not counted on an account another attempt has just locked: the statement touches only a row whose lock has passed"
import io
p = '/home/user/rundesk/apps/api/src/common/security/lockout.ts'
a = (
    "    .where(and(eq(users.id, userId), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))\n"
    "    .returning({ failedLoginAttempts: users.failedLoginAttempts, lockedUntil: users.lockedUntil })\n"
)
b = (
    "    .where(eq(users.id, userId))\n"
    "    .returning({ failedLoginAttempts: users.failedLoginAttempts, lockedUntil: users.lockedUntil })\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-4-a-locked-account-is-counted-too-unit: attempts past the lock keep counting')
