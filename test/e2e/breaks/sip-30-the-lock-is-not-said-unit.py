# THE WRONG CURRENT PASSWORD THAT LOCKS THE ACCOUNT DOES NOT SAY SO, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-29`'s edit, claimed by the unit test: the attempt that reaches the
# threshold is refused 403, not 423, and says nothing of the lock.
#
# Reddens: unit: users.service.test.ts "the wrong current password that reaches the policy’s threshold is refused 423, saying the account is locked and for how long"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "        if (lockedNow) throw accountLocked(lockedNow, now, 'Current password is incorrect, and too many wrong passwords have locked this account.')\n"
b = "        void lockedNow\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-30-the-lock-is-not-said-unit: the wrong current password that locks the account is answered as any other')
