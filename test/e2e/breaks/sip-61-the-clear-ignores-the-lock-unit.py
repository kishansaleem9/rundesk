# THE CLEAR-ON-SUCCESS IGNORES THE LOCK (`found-30-sep/a-burst-is-compared-before-the-lock`).
#
# The success clear's WHERE excludes a locked account, so a success that finds
# the account locked clears nothing and is refused. Drop the lock guard and the
# clear always matches, so a success never sees the lock: the burst's right one
# clears and signs in.
#
# Reddens: unit: auth.service.test.ts "a right password clears the count only when the account is not locked, in one statement whose WHERE excludes a locked account"
import io
p = '/home/user/rundesk/apps/api/src/common/security/lockout.ts'
a = (
    "    .where(and(eq(users.id, userId), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))\n"
    "    .returning({ id: users.id })\n"
)
b = (
    "    .where(eq(users.id, userId))\n"
    "    .returning({ id: users.id })\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-61-the-clear-ignores-the-lock-unit: the clear-on-success no longer excludes a locked account')
