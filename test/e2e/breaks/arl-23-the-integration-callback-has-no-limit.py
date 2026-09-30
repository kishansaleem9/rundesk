# AN INTEGRATION'S OAUTH CALLBACK HAS NO LIMIT (`found-30-sep/oauth-routes-unthrottled`).
#
# The connection callback's `@RateLimit` goes; its guard stays and counts
# nothing. A callback whose state still reads exchanges a code with the
# provider, or writes a failure onto the integration's card, as often as one
# address asks.
#
# Reddens: auth-route-limits:
#   "a burst of 31 integration OAuth callbacks from one address: 30 are sent back to the app, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "  @UseGuards(RateLimitGuard)\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n"
b = "  @UseGuards(RateLimitGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-23-the-integration-callback-has-no-limit: the integration OAuth callback has no limit')
