# A LOCKED ACCOUNT'S CHANGE IS COMPARED, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-27`'s edit, claimed by the unit test: a locked account's current
# password is compared, and the change goes on.
#
# Reddens: unit: users.service.test.ts "a locked account’s change is refused 423 before its current password is compared, and nothing is counted or written"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "    if (locked) throw accountLocked(locked, now, 'This account is locked after too many wrong passwords.')\n"
b = "    void locked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-28-a-locked-account-changes-its-password-unit: the change does not ask whether the account is locked')
