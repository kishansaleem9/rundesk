# THE LOCK COMES ONE WRONG PASSWORD LATE (`found-30-sep/lockout-counts-overlapping-attempts-once`).
#
# Every wrong password is still counted in one statement, but the account
# locks when the count passes the policy's threshold instead of reaching it:
# at the sixth, where the policy says five.
#
# Reddens: sign-in-and-password:
#   "a fifth wrong password after them locks it at the policy’s five: it has a lock, and its right password is then refused 401"
#   "five wrong passwords sent at once lock it at once: it has a lock, and its right password is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.service.ts'
a = "    const reachesThreshold = sql`${users.failedLoginAttempts} + 1 >= ${policy.lockoutThreshold}`\n"
b = "    const reachesThreshold = sql`${users.failedLoginAttempts} + 1 > ${policy.lockoutThreshold}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-5-the-lock-comes-one-late: the account locks at the sixth wrong password')
