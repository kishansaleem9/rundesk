# AN ACCESS TOKEN IS CHECKED FOR ITS SIGNATURE ALONE AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `JwtStrategy` no longer asks whether the session the token names is live, so
# a session ended by a password change, a reset, "sign out other sessions",
# revoking it, signing out or the session cap reads on for the fifteen minutes
# its access token has left.
#
# Reddens: sign-in-and-password:
#   "a session a password change signs out is refused at once: its access token’s read (GET /users/me) is refused 401, as is the sign-up session’s, and its refresh is refused 401, while the session that made the change reads and refreshes on"
#   "so is a session ended any other way: revoked by id, signed out, by \"Sign out other sessions\", by a reset or by the session cap, its access token’s read is refused 401 at once, while the session that ended the others reads on"
#   "\"Sign out other sessions\" made as a browser (its cookies and the CSRF header, nothing in the body) keeps the browser’s session: it reads and refreshes on, and the other session’s read is refused 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/strategies/jwt.strategy.ts'
a = "    if (!(await sessionIsLive(this.db, payload))) throw new UnauthorizedException('Session ended')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-37-the-strategy-asks-no-session: an access token is checked for its signature alone')
