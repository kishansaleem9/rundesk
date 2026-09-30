# THE PICTURES HAVE NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The image route's `@RateLimit` goes. Each ask signs a URL to the store, so
# one address may make the API sign as fast as it can ask. The budget is ten
# times a page's, because a page draws dozens of pictures; none at all is not
# that. The check after the window fails with it, since the logo refused
# nothing and there was nothing to come back from.
#
# Reddens: public-route-limits:
#   "a burst of 1,201 asks for a logo from one address: 1,200 are served, ten times a page’s budget for the dozens of pictures one page draws, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.image)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-5-the-pictures-have-no-limit: avatars and logos may be asked without limit')
