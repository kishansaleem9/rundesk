# THE OLD REGISTER ROUTE HAS NO LIMIT AGAIN (`found-30-sep/register-unthrottled`).
#
# Its `@RateLimit` goes; the controller keeps the guard, which counts nothing
# on a route with no policy. One address makes accounts, each with a workspace
# and a password hashed at cost 12 on the event loop, as fast as it asks:
# sign-up's ten a minute with a way round it.
#
# Reddens: auth-route-limits:
#   "a burst of 11 registrations from one address in one minute: 10 are answered by the route (the first makes an account, nine more find the email taken), and the eleventh is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address registering in the same minute makes its account"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = "  @Post('register')\n  @RateLimit(AUTH_ROUTE_LIMITS.signUp)\n"
b = "  @Post('register')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-5-register-has-no-limit: register has no limit')
