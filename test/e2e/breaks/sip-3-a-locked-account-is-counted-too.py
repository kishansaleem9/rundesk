# A WRONG PASSWORD IS COUNTED ON AN ACCOUNT ANOTHER ATTEMPT HAS JUST LOCKED (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# The statement no longer asks whether the account is already locked, so the
# attempts that were in flight when the fifth locked it keep counting: eight
# sent at once leave the lock and three counted toward the next one, which
# then comes after two wrong passwords, not five.
#
# Re-anchored 30 September: the statement moved to `common/security/lockout.ts`
# (`found-30-sep/password-change-guesses-600-an-hour`), so a password change
# counts with it too; the line and the edit are the same.
#
# Reddens: sign-in-and-password:
#   "eight sent at once lock it at the fifth and count none past it: it has a lock, failed_login_attempts reads 0, and its right password is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/common/security/lockout.ts'
a = "    .where(and(eq(users.id, userId), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))\n"
b = "    .where(eq(users.id, userId))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-3-a-locked-account-is-counted-too: attempts past the lock keep counting')
