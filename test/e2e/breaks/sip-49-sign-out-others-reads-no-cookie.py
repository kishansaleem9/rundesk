# "SIGN OUT OTHER SESSIONS" READS THE BODY ALONE AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The browser's refresh cookie no longer names the caller's session, and the
# web keeps its refresh token in memory only, so after a reload "Sign out other
# sessions" revokes the browser's own session too: with an ended session
# refused at once, the person is signed out by it.
#
# RE-AIMED 6 October: "Sign out other sessions" keeps the session the caller's access token names too
# (`found-30-sep/the-callers-session-is-named-by-its-refresh-token`), which keeps a browser's own session without
# its cookie; so the body alone is what it reads here, neither the cookie nor the token's session.
# Reddens: sign-in-and-password:
#   "\"Sign out other sessions\" made as a browser (its cookies and the CSRF header, nothing in the body) keeps the browser’s session: it reads and refreshes on, and the other session’s read is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = '    return this.authService.revokeOtherSessions(user.id, named ?? req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null, user.sid)\n'
b = '    return this.authService.revokeOtherSessions(user.id, named)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-49-sign-out-others-reads-no-cookie: "sign out other sessions" reads no refresh cookie')
