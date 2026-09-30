# SIGN-UP HAS NO LIMIT AGAIN (`found-30-sep/register-unthrottled`, `found-30-sep/register-counted-apart-from-signup`).
#
# Sign-up's `@RateLimit` goes; the controller keeps the guard, which counts
# nothing on a route with no policy. With the old register route retired,
# sign-up is the one way to make an account without an invitation, and one
# address makes them, each with an organization, a workspace and a password
# hashed at cost 12, as fast as it asks.
#
# Reddens: auth-route-limits:
#   "a burst of 11 sign-ups from one address in one minute: 10 are answered by the route (the first makes an account, nine more find the email taken), and the eleventh is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address signing up in the same minute makes its account"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = "  @Post('signup')\n  @RateLimit(AUTH_ROUTE_LIMITS.signUp)\n"
b = "  @Post('signup')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-5-sign-up-has-no-limit: sign-up has no limit')
