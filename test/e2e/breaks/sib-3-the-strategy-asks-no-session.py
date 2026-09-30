# AN ACCESS TOKEN IS CHECKED FOR ITS SIGNATURE ALONE AGAIN, IN A BROWSER (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-37`'s edit, measured where a person sees it: a browser whose session a
# password change made elsewhere has ended still reads after a reload, by its
# access cookie, until the cookie's token runs out.
#
# Reddens: session-in-the-browser:
#   "a browser whose session a password change made elsewhere has ended is signed out at its next reload: /users/me and the refresh are refused, no user is held, and /app sends it to the sign-in page"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/strategies/jwt.strategy.ts'
a = "    if (!(await sessionIsLive(this.db, payload))) throw new UnauthorizedException('Session ended')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sib-3-the-strategy-asks-no-session: an access token is checked for its signature alone')
