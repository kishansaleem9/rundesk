# A SHARED DOC HAS NO LIMIT, READ FROM ITS METADATA (`found-30-sep/public-routes-unthrottled`).
#
# `prl-1`'s edit, claimed by the unit test: the doc route's `@RateLimit` goes,
# so the guard in its chain counts nothing on it, and one address may open a
# doc's public link as often as it likes.
#
# Reddens: unit: public-route-limits.test.ts "GET /public/docs/:slug carries the page budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n  getPublic(@Param('slug') slug: string) {\n"
b = "  getPublic(@Param('slug') slug: string) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-12-the-doc-has-no-limit-unit: a shared doc may be opened without limit')
