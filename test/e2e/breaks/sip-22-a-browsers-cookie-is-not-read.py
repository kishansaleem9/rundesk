# A PASSWORD CHANGE READS NO REFRESH COOKIE (`found-30-sep/password-change-unthrottled`).
#
# Only a session named in the body is kept, so a browser, which names its
# session by its refresh cookie, keeps none: the change signs it out along
# with every other.
#
# RE-AIMED 6 October: the change keeps the session the caller's access token names as well
# (`found-30-sep/the-callers-session-is-named-by-its-refresh-token`), which keeps a browser's own session without
# its cookie; so neither the cookie nor the token's session names it here.
# Reddens: sign-in-and-password:
#   "a change made as a browser makes it (its cookies and the CSRF header) signs out the account’s other sessions and keeps the browser’s: the other session’s refresh is refused 401, the browser’s answered 200"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = '    const keep = named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null\n'
b = '    const keep = named ?? (req.cookies?.[REFRESH_TOKEN_COOKIE] ? null : null)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep, user.sid)\n'
b = '    return this.users.changePassword(user.id, body?.currentPassword, body?.newPassword, keep)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-22-a-browsers-cookie-is-not-read: the refresh cookie names no session')
