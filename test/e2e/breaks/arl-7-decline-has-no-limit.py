# DECLINING AN INVITATION HAS NO LIMIT (`found-30-sep/register-unthrottled`).
#
# The decline's `@RateLimit` goes: one address answers invitations no, or asks
# about tokens that name none, as often as it likes.
#
# Reddens: auth-route-limits:
#   "a burst of 11 declines of an invitation from one address: 10 are answered, and the eleventh is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "  @Post('decline')\n  @RateLimit(AUTH_ROUTE_LIMITS.signUp)\n"
b = "  @Post('decline')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-7-decline-has-no-limit: declining an invitation has no limit')
