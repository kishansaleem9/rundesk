# THE SIGN-IN PROVIDERS LIST IS GIVEN THE REDIRECTS' THIRTY (`found-30-sep/oauth-routes-unthrottled`).
#
# The list the login page asks once per load, and CI's "Start the API" step
# polls once a second for up to a minute as its readiness probe, is limited like
# the redirects: CI's own poll would be refused after thirty seconds.
#
# Reddens: auth-route-limits:
#   "the sign-in providers are answered to every ask, 121 from one address in one minute: the login page asks once per load and CI’s readiness poll once a second"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "  @Get('providers')\n  @ApiOperation("
b = "  @Get('providers')\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n  @ApiOperation("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-25-the-providers-list-is-limited: the providers list is limited to thirty a minute')
