# CHANGING ONE'S PASSWORD HAS NO LIMIT AGAIN, READ FROM ITS METADATA (`found-30-sep/password-change-unthrottled`).
#
# `sip-12`'s edit, claimed by the unit test: the route carries no policy, so
# the guard in its chain counts nothing on it.
#
# Reddens: unit: auth-route-limits.test.ts "POST /users/me/change-password carries the passwordChange budget, and RateLimitGuard reads it after JwtAuthGuard has said who is asking"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = "  @UseGuards(RateLimitGuard)\n  @RateLimit(AUTH_ROUTE_LIMITS.passwordChange)\n"
b = "  @UseGuards(RateLimitGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-13-a-password-change-has-no-limit-unit: the password change has no limit')
