# GOOGLE'S AND MICROSOFT'S SIGN-IN CALLBACK HAS NO LIMIT, READ FROM ITS METADATA (`found-30-sep/oauth-routes-unthrottled`).
#
# `arl-21`'s edit, claimed by the unit test: the callback's `@RateLimit` goes,
# so the guard on its class counts nothing on it.
#
# Reddens: unit: auth-route-limits.test.ts "GET /auth/oauth/:provider/callback carries the oauthRedirect budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "  @Get(':provider/callback')\n  @RateLimit(AUTH_ROUTE_LIMITS.oauthRedirect)\n"
b = "  @Get(':provider/callback')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-27-the-google-callback-has-no-limit-unit: the Google sign-in callback has no limit')
