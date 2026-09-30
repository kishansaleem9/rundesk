# A RIGHT CURRENT PASSWORD LEAVES THE COUNT STANDING (`found-30-sep/password-change-guesses-600-an-hour`).
#
# The change writes the new password but not the lockout's columns, so wrong
# passwords counted before it stay counted: a person who mistyped twice and
# then changed their password is locked by three more mistakes, not five.
#
# Reddens: sign-in-and-password:
#   "a right current password clears the count, as a right password at sign-in does: after two wrong ones the change is made (201) and failed_login_attempts reads 0"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "        .set({ passwordHash, updatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })\n"
b = "        .set({ passwordHash, updatedAt: new Date() })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-31-a-right-current-password-leaves-the-count: a change clears no count')
