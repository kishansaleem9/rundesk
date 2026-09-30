# CHANGING ONE'S PASSWORD HAS NO LIMIT AGAIN (`found-30-sep/password-change-unthrottled`).
#
# The route's `@RateLimit` goes; the handler keeps the guard, which counts
# nothing on a route with no policy. A session somebody else holds guesses the
# password behind it at a hash a request, with no limit at all where the
# workspace has switched its lockout off.
#
# Re-aimed 30 September (`found-30-sep/password-change-guesses-600-an-hour`):
# a wrong current password is answered 403 now, and the burst is measured with
# the workspace's lockout off, so the sentences say so. The edit is unchanged.
#
# Reddens: sign-in-and-password:
#   "a burst of 11 password changes by one person in one minute, each with a wrong current password and the workspace’s lockout off: 10 are answered 403 by the route, and the eleventh is refused with 429 and a Retry-After"
#   "the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 403"
import io
p = '/home/user/rundesk/apps/api/src/modules/users/users.controller.ts'
a = "  @UseGuards(RateLimitGuard)\n  @RateLimit(AUTH_ROUTE_LIMITS.passwordChange)\n"
b = "  @UseGuards(RateLimitGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-12-a-password-change-has-no-limit: the password change has no limit')
