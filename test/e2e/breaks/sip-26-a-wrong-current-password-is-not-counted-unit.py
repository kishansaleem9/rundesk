# A WRONG CURRENT PASSWORD COUNTS FOR NOTHING AGAIN, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-25`'s edit, claimed by the unit test: no statement counts the wrong
# current password.
#
# Reddens: unit: users.service.test.ts "a wrong current password is counted by the statement sign-in counts with, the row’s failed_login_attempts + 1, and refused 403"
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
print('sip-26-a-wrong-current-password-is-not-counted-unit: a wrong current password is not counted')
