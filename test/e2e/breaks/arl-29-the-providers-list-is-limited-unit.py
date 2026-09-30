# THE SIGN-IN PROVIDERS LIST IS GIVEN THE REDIRECTS' THIRTY, READ FROM ITS METADATA (`found-30-sep/oauth-routes-unthrottled`).
#
# `arl-25`'s edit, claimed by the unit test: the providers list carries a
# policy, so every ask of CI's readiness poll and every login page is counted.
#
# Reddens: unit: auth-route-limits.test.ts "GET /auth/oauth/providers is never counted: CI’s readiness poll and every login page ask it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "  @Get('providers')\n  @ApiOperation("
b = "  @Get('providers')\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n  @ApiOperation("
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-29-the-providers-list-is-limited-unit: the providers list is limited to thirty a minute')
