# GOOGLE'S AND MICROSOFT'S SIGN-IN CALLBACK HAS NO LIMIT (`found-30-sep/oauth-routes-unthrottled`).
#
# The callback's `@RateLimit` goes; the class keeps the guard, which counts
# nothing on a route with no policy. A callback carrying a live state exchanges
# its code with the provider and writes an account or a link, as often as one
# address asks.
#
# Reddens: auth-route-limits:
#   "a burst of 31 Google sign-in callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "  @Get(':provider/callback')\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n"
b = "  @Get(':provider/callback')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-21-the-google-callback-has-no-limit: the Google sign-in callback has no limit')
