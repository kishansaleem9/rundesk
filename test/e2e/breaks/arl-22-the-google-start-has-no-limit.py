# STARTING A GOOGLE OR MICROSOFT SIGN-IN HAS NO LIMIT (`found-30-sep/oauth-routes-unthrottled`).
#
# The start's `@RateLimit` goes: one address mints signed states and sends
# people on to the provider as fast as it asks.
#
# Reddens: auth-route-limits:
#   "a burst of 31 starts of signing in with Google from one address: 30 are sent on, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "  @Get(':provider')\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n"
b = "  @Get(':provider')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-22-the-google-start-has-no-limit: the Google sign-in start has no limit')
