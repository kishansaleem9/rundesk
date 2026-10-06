# SIGNING OUT THE OTHER SESSIONS IS NOT TOLD THE SESSION THE CALLER’S ACCESS TOKEN NAMES.
# Reddens: unit: auth.controller.test.ts "“Sign out other sessions” keeps the session a browser’s refresh cookie names when the body names none, and one named in the body first"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = '    return this.authService.revokeOtherSessions(user.id, named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null, user.sid)\n'
b = '    return this.authService.revokeOtherSessions(user.id, named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-75-sign-out-others-is-not-told-the-caller-s-session-unit: auth.controller.ts: signing out the others is not told the caller’s session.')
