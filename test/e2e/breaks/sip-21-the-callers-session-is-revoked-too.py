# A PASSWORD CHANGE REVOKES THE CALLER'S OWN SESSION TOO (`found-30-sep/password-change-unthrottled`).
#
# The session the caller's refresh token names is matched by a digest that is
# no digest of it, so nothing is kept: the person who changed their password
# is signed out of the tab they did it in, at once now that an ended session's
# access token is refused (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# RE-AIMED 6 October: the change keeps the session the caller's access token names as well
# (`found-30-sep/the-callers-session-is-named-by-its-refresh-token`), which kept the caller's session with the
# digest broken; so neither the refresh token nor the token's session keeps it here.
# Reddens: sign-in-and-password:
#   "a change made as a browser makes it (its cookies and the CSRF header) signs out the account’s other sessions and keeps the browser’s: the other session’s refresh is refused 401, the browser’s answered 200"
#   "a change by a client naming its session in the body (currentRefreshToken) keeps it and signs out the other two: its refresh is answered 200, the other sign-in’s and the sign-up’s are refused 401, and the change says it revoked 2"
#   "a session a password change signs out is refused at once: its access token’s read (GET /users/me) is refused 401, as is the sign-up session’s, and its refresh is refused 401, while the session that made the change reads and refreshes on"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = '    const kept = keepRefreshToken ? [hashRefreshToken(keepRefreshToken), keepRefreshToken] : []\n'
b = '    const kept = keepRefreshToken ? [hashRefreshToken(keepRefreshToken).slice(1)] : []\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/users/users.service.ts'
a = '            ...(keepSessionId ? [ne(sessions.id, keepSessionId)] : []),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-21-the-callers-session-is-revoked-too: the caller keeps no session')
