# ACCEPTING AN INVITATION HAS NO LIMIT (`found-30-sep/register-unthrottled`).
#
# The claim's `@RateLimit` goes. It makes the invitee's account and hands back
# a session, and one address may ask it as often as it likes.
#
# Reddens: auth-route-limits:
#   "a burst of 11 invitation claims from one address: 10 are answered by the route (the first accepts, the rest name no invitation), and the eleventh is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "  @Post('claim')\n  @RateLimit(AUTH_ROUTE_LIMITS.signUp)\n"
b = "  @Post('claim')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-6-claim-has-no-limit: claiming an invitation has no limit')
