# A CLIP'S LINK HAS NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The clip route's `@RateLimit` goes. Every open of a clip's link asks the
# store about the object and signs a fresh playback URL, so one address can
# make the store answer as fast as it can ask — the route the ledger item was
# found on. The check after the window fails with it, since the clip refused
# nothing and there was nothing to come back from.
#
# Reddens: public-route-limits:
#   "a burst of 121 opens of a clip’s link from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-2-the-clip-has-no-limit: a clip link may be opened without limit')
