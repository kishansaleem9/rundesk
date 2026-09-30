# THE CHANGE COUNTS A WRONG CURRENT PASSWORD WHERE THE WORKSPACE HAS NO LOCKOUT, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-33`'s edit, claimed by the unit test: with the lockout off, the wrong
# current password is still counted.
#
# Reddens: unit: users.service.test.ts "with the lockout off, a wrong current password is refused 403 and counts nothing, and a lock left on the row refuses nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "      if (settings.lockoutEnabled) {\n        const counted = await countWrongPassword(this.db, userId, settings, now)\n"
b = "      if (settings.lockoutEnabled || true) {\n        const counted = await countWrongPassword(this.db, userId, settings, now)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-34-the-change-counts-with-the-lockout-off-unit: the change counts whatever the policy says')
