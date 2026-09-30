# STARTING AN SSO SIGN-IN HAS NO LIMIT (`found-30-sep/register-unthrottled`).
#
# The start's `@RateLimit` goes. For a workspace with a connection each ask
# fetches the identity provider's discovery document and writes a login state;
# one address may ask as often as it likes.
#
# Reddens: auth-route-limits:
#   "a burst of 31 SSO sign-in starts from one address: 30 are answered by the route, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = "  @Get(':provider/start')\n  @RateLimit(AUTH_ROUTE_LIMITS.ssoRedirect)\n"
b = "  @Get(':provider/start')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-11-the-sso-start-has-no-limit: the SSO start has no limit')
