# EVERY ADDRESS SHARES ONE COUNTER PER ROUTE, UNDER THE REAL ROUTES (`found-30-sep/public-routes-unthrottled`).
#
# `prl-8`'s edit, claimed by the unit test that drives the guard with the doc
# route's own metadata: once one address has spent a doc's budget, another
# address is refused too, so a flood from anywhere closes the link to everyone.
#
# Reddens: unit: public-route-limits.test.ts "the 121st open of a shared doc in a minute from one address is refused with 429 and a Retry-After, and another address is still served"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "    const bucket = `${routeKey}:${clientIp}:${windowIndex}`\n"
b = "    const bucket = `${routeKey}:${windowIndex}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-15-every-address-shares-a-counter-unit: the counter is keyed by route alone')
