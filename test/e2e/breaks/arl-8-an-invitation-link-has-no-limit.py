# OPENING AN INVITATION'S LINK HAS NO LIMIT (`found-30-sep/register-unthrottled`).
#
# The preview's `@RateLimit` goes: every open reads the invitation, its
# organization, its sender and whether the invitee has an account, as often as
# one address asks.
#
# Reddens: auth-route-limits:
#   "a burst of 121 opens of an invitation’s link from one address: 120 are answered with the invitation, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "  @Get('preview')\n  @RateLimit(AUTH_ROUTE_LIMITS.invitationLink)\n"
b = "  @Get('preview')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-8-an-invitation-link-has-no-limit: an invitation link has no limit')
