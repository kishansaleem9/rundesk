# THE STATUS PAGE HAS NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The status route's `@RateLimit` goes; its controller keeps the guard, which
# counts nothing on a route with no policy. The page people open when the
# product misbehaves can be flooded by one address, two reads of the database
# an ask. The check after the window fails with it, since the status page
# refused nothing and there was nothing to come back from.
#
# Reddens: public-route-limits:
#   "a burst of 121 opens of the status page from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/modules/support/support.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-18-the-status-page-has-no-limit: the status page may be opened without limit')
