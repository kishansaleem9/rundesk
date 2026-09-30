# A RIGHT CURRENT PASSWORD LEAVES THE COUNT STANDING, READ FROM THE SERVICE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# `sip-31`'s edit, claimed by the unit test: the transaction writes the
# password and not the lockout's columns.
#
# Reddens: unit: users.service.test.ts "a right current password clears the count and the lock, in the transaction that writes the password"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "        .set({ passwordHash, updatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })\n"
b = "        .set({ passwordHash, updatedAt: new Date() })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-32-a-right-current-password-leaves-the-count-unit: a change clears no count')
