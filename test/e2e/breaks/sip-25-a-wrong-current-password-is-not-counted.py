# A WRONG CURRENT PASSWORD COUNTS FOR NOTHING AGAIN (`found-30-sep/password-change-guesses-600-an-hour`).
#
# The change compares the current password and refuses a wrong one, but no
# longer counts it toward the account's lockout: a session somebody else holds
# guesses ten a minute, 600 an hour, and the lock never comes.
#
# Reddens: sign-in-and-password:
#   "five wrong current passwords in a row count toward the account’s lockout as five wrong sign-ins would: the first four are refused 403 and counted 1 to 4, and the fifth locks the account and is refused 423 saying so"
#   "the sixth, even with the right current password, is refused 423 saying the account is locked and for how long, the password is not changed, and signing in with it is refused 401 while the lock lasts"
#   "wrong passwords at sign-in and at the change share one count: three wrong sign-ins and then two wrong current passwords lock the account at the policy’s five, and its right password is refused 401 at sign-in"
#   "a right current password clears the count, as a right password at sign-in does: after two wrong ones the change is made (201) and failed_login_attempts reads 0"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = (
    "      if (settings.lockoutEnabled) {\n"
    "        const counted = await countWrongPassword(this.db, userId, settings, now)\n"
    "        // Counted nothing: another attempt locked the account while this one compared.\n"
    "        const lockedNow = counted ? lockedUntilNow(counted, settings, now) : lockedUntilNow((await this.findById(userId)) ?? user, settings, now)\n"
    "        if (lockedNow) throw accountLocked(lockedNow, now, 'Current password is incorrect, and too many wrong passwords have locked this account.')\n"
    "      }\n"
)
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-25-a-wrong-current-password-is-not-counted: a wrong current password is not counted')
