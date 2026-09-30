# EVERY ADDRESS SHARES ONE COUNTER PER ROUTE (`found-30-sep/public-routes-unthrottled`).
#
# The shared counter's key loses the address: one per route and minute. Then
# one address flooding a doc's link refuses it to every other visitor in the
# world for the rest of the minute — the throttle becomes the flood's weapon.
# On a lane every suite asks from 127.0.0.1, so only a second address can
# tell; the suite asks from 127.0.0.2.
#
# Reddens: public-route-limits: "the refusal is the address’s alone: another address opening the same doc in the same minute is served"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "    const bucket = `${routeKey}:${clientIp}:${windowIndex}`\n"
b = "    const bucket = `${routeKey}:${windowIndex}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-8-every-address-shares-a-counter: the counter is keyed by route alone')
