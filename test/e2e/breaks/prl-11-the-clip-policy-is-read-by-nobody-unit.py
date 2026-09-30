# THE CLIP ROUTE KEEPS ITS POLICY AND LOSES ITS GUARD (`found-30-sep/public-routes-unthrottled`).
#
# `RateLimitGuard` leaves the clip controller's chain; `@RateLimit` stays on
# the handler. The policy is then a label nothing reads — the route reads as
# limited in the source and is not — and a clip's link can be flooded again,
# each open a look at the store.
#
# Reddens: unit: public-route-limits.test.ts "GET /public/clips/:token carries the page budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.controller.ts'
a = "@UseGuards(RateLimitGuard, OptionalJwtAuthGuard)\n"
b = "@UseGuards(OptionalJwtAuthGuard)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-11-the-clip-policy-is-read-by-nobody-unit: the clip route has a policy and no guard to read it')
