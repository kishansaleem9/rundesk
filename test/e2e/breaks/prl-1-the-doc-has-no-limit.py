# A SHARED DOC HAS NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The doc route's `@RateLimit` goes; its controller keeps the guard, which
# counts nothing on a route with no policy. One address may open a doc's
# public link as often as it likes, and every open reads the doc's content —
# the flood the ledger item names.
#
# FOUR CHECKS: the doc's burst, and the three that stand on the doc refusing
# somebody — another address, another route, and coming back after the window
# — each of which says it shows nothing when nothing was refused.
#
# Reddens: public-route-limits:
#   "a burst of 121 opens of a shared doc from one address in one minute: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address opening the same doc in the same minute is served"
#   "and the route’s alone: the address the doc refuses is still served a clip’s link"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n  getPublic(@Param('slug') slug: string) {\n"
b = "  getPublic(@Param('slug') slug: string) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-1-the-doc-has-no-limit: a shared doc may be opened without limit')
