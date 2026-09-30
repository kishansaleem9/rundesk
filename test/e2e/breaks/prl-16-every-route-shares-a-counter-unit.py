# EVERY ROUTE SHARES ONE COUNTER PER ADDRESS, UNDER THE REAL ROUTES (`found-30-sep/public-routes-unthrottled`).
#
# `prl-9`'s edit, claimed by the unit test that drives the guard with the doc
# and clip routes' own metadata: an address the doc has refused is refused a
# clip's link as well, though it never asked for one.
#
# Reddens: unit: public-route-limits.test.ts "the address a shared doc refuses is still served a clip’s link: each route counts on its own"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "    const bucket = `${routeKey}:${clientIp}:${windowIndex}`\n"
b = "    const bucket = `${clientIp}:${windowIndex}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-16-every-route-shares-a-counter-unit: the counter is keyed by address alone')
