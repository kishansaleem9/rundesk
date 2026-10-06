# A PASSWORD CHANGE IS NOT TOLD THE SESSION THE CALLER’S ACCESS TOKEN NAMES, asked of the controller itself.
# Reddens: unit: users.controller.test.ts "a browser’s session is the one its refresh cookie names, when the body names none"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep, user.sid)\n'
b = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-78-a-password-change-is-not-told-the-caller-s-session-unit: users.controller.ts: a password change is not told the caller’s session.')
