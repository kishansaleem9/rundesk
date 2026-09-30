# THE WRONG CURRENT PASSWORD THAT LOCKS THE ACCOUNT DOES NOT SAY SO (`found-30-sep/password-change-guesses-600-an-hour`).
#
# It is counted, and it locks the account, but it is answered as any wrong one
# is (403 "Current password is incorrect"): the person learns of the lock only
# at their next try, or at sign-in, where nothing will tell them.
#
# Reddens: sign-in-and-password:
#   "five wrong current passwords in a row count toward the account’s lockout as five wrong sign-ins would: the first four are refused 403 and counted 1 to 4, and the fifth locks the account and is refused 423 saying so"
#   "wrong passwords at sign-in and at the change share one count: three wrong sign-ins and then two wrong current passwords lock the account at the policy’s five, and its right password is refused 401 at sign-in"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "        if (lockedNow) throw accountLocked(lockedNow, now, 'Current password is incorrect, and too many wrong passwords have locked this account.')\n"
b = "        void lockedNow\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-29-the-lock-is-not-said: the wrong current password that locks the account is answered as any other')
