# A CLIENT PORTAL HAS NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The portal route's `@RateLimit` goes. Every view reads the project's tasks
# and writes when the portal was last viewed, so one address flooding a portal
# link is a flood of reads and writes. The check after the window fails with
# it, since the portal refused nothing and there was nothing to come back from.
#
# Reddens: public-route-limits:
#   "a burst of 121 opens of a client portal from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-3-the-portal-has-no-limit: a portal may be opened without limit')
