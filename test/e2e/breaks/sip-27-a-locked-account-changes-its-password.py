# A LOCKED ACCOUNT'S CHANGE IS COMPARED, AND MADE (`found-30-sep/password-change-guesses-600-an-hour`).
#
# The change no longer asks whether the account is locked before comparing its
# current password: the lock stops sign-in and not the change, so a session
# somebody else holds guesses on through it, and the right guess changes the
# password while the owner is locked out.
#
# Reddens: sign-in-and-password:
#   "the sixth, even with the right current password, is refused 423 saying the account is locked and for how long, the password is not changed, and signing in with it is refused 401 while the lock lasts"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = "    if (locked) throw accountLocked(locked, now, 'This account is locked after too many wrong passwords.')\n"
b = "    void locked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-27-a-locked-account-changes-its-password: the change does not ask whether the account is locked')
