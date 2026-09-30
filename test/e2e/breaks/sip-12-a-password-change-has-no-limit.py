# CHANGING ONE'S PASSWORD HAS NO LIMIT AGAIN (`found-30-sep/password-change-unthrottled`).
#
# The route's `@RateLimit` goes; the handler keeps the guard, which counts
# nothing on a route with no policy. A session somebody else holds guesses the
# password behind it at a hash a request, with no sign-in limit and no lockout.
#
# Reddens: sign-in-and-password:
#   "a burst of 11 password changes by one person in one minute, each with a wrong current password: 10 are answered 401 by the route, and the eleventh is refused with 429 and a Retry-After"
#   "the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 401"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = "  @UseGuards(RateLimitGuard)\n  @RateLimit(AUTH_ROUTE_LIMITS.passwordChange)\n"
b = "  @UseGuards(RateLimitGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-12-a-password-change-has-no-limit: the password change has no limit')
