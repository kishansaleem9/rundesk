# THE SESSIONS LIST IS NOT TOLD THE SESSION THE CALLER’S ACCESS TOKEN NAMES: read by cookies
# alone, no row is this device.
# Reddens: sign-in-and-password: "the sessions list read by a browser’s cookies alone, as after a reload, marks one session as this device — the same one its access token names when read by it, no refresh token in the query"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = '    return this.authService.listSessions(user.id, currentRefreshToken, user.sid)\n'
b = '    return this.authService.listSessions(user.id, currentRefreshToken)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-76-the-sessions-list-is-not-told-the-caller-s-session: auth.controller.ts: the sessions list is not told the caller’s session.')
