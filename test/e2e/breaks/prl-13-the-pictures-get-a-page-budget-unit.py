# THE PICTURES GET A PAGE'S BUDGET (`found-30-sep/public-routes-unthrottled`).
#
# The image route is given `PUBLIC_ROUTE_LIMITS.page`, as a copy from the
# page routes would give it. A page draws dozens of avatars and logos, for
# members as well as visitors, so an office opening a busy list or People
# page meets broken pictures after 120 in a minute.
#
# Reddens: unit: public-route-limits.test.ts "GET /public/images/:folder/:name carries the image budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/public-images.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.image)\n"
b = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-13-the-pictures-get-a-page-budget-unit: avatars and logos are limited like a page')
