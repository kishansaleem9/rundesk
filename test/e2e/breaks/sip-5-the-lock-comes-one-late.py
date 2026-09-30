# THE LOCK COMES ONE WRONG PASSWORD LATE (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# Every wrong password is still counted in one statement, but the account
# locks when the count passes the policy's threshold instead of reaching it:
# at the sixth, where the policy says five.
#
# Re-anchored 30 September: the statement moved to `common/security/lockout.ts`,
# and a password change counts with it too
# (`found-30-sep/password-change-guesses-600-an-hour`), so the lock comes one
# wrong current password late as well: three of the change's checks redden with
# sign-in's two.
#
# Reddens: sign-in-and-password:
#   "a fifth wrong password after them locks it at the policy’s five: it has a lock, and its right password is then refused 401"
#   "five wrong passwords sent at once lock it at once: it has a lock, and its right password is refused 401"
#   "five wrong current passwords in a row count toward the account’s lockout as five wrong sign-ins would: the first four are refused 403 and counted 1 to 4, and the fifth locks the account and is refused 423 saying so"
#   "the sixth, even with the right current password, is refused 423 saying the account is locked and for how long, the password is not changed, and signing in with it is refused 401 while the lock lasts"
#   "wrong passwords at sign-in and at the change share one count: three wrong sign-ins and then two wrong current passwords lock the account at the policy’s five, and its right password is refused 401 at sign-in"
import io
p = '/home/user/rundesk/apps/api/src/common/security/lockout.ts'
a = "  const reachesThreshold = sql`${users.failedLoginAttempts} + 1 >= ${policy.lockoutThreshold}`\n"
b = "  const reachesThreshold = sql`${users.failedLoginAttempts} + 1 > ${policy.lockoutThreshold}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-5-the-lock-comes-one-late: the account locks at the sixth wrong password')
