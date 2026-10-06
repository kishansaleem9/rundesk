# A PASSWORD CHANGE IS NOT TOLD THE SESSION THE CALLER’S ACCESS TOKEN NAMES: a client that names
# none is signed out by its own change.
# Reddens: sign-in-and-password: "a client that names no session keeps its own through its own password change — it reads on — and the other session is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep, user.sid)\n'
b = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-77-a-password-change-is-not-told-the-caller-s-session: users.controller.ts: a password change is not told the caller’s session.')
