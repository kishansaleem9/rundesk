# SIGN-UP HAS NO LIMIT, READ FROM ITS METADATA (`found-30-sep/register-unthrottled`, `found-30-sep/register-counted-apart-from-signup`).
#
# `arl-5`'s edit, claimed by the unit test: sign-up's `@RateLimit` goes, so the
# guard in its chain counts nothing on it.
#
# Reddens: unit: auth-route-limits.test.ts "POST /auth/signup carries the signUp budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/auth.controller.ts'
a = "  @Post('signup')\n  @RateLimit(AUTH_ROUTE_LIMITS.signUp)\n"
b = "  @Post('signup')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-17-sign-up-has-no-limit-unit: sign-up has no limit')
