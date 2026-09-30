# EVERY ROUTE SHARES ONE COUNTER PER ADDRESS (`found-30-sep/public-routes-unthrottled`).
#
# The shared counter's key loses the route: one per address and minute, so
# every throttled route draws on the same count, sign-in's included. Opening
# 120 docs spends the address's clip links, portals and pictures too, and a
# page of avatars can spend a visitor's doc.
#
# EIGHT CHECKS. The visitor's first ask of each of the six routes already
# spends the doc's count (115 served, not 120), each later page route serves
# only its first ask, and the logo's burst stops where the one count reaches
# 1,200 (594 served).
#
# Reddens: public-route-limits:
#   "and the route’s alone: the address the doc refuses is still served a clip’s link"
#   "a burst of 121 opens of a shared doc from one address in one minute: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address opening the same doc in the same minute is served"
#   "a burst of 121 opens of a clip’s link from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 opens of a client portal from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 asks for a custom domain’s branding from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 opens of the status page from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 1,201 asks for a logo from one address: 1,200 are served, ten times a page’s budget for the dozens of pictures one page draws, and the one past them is refused with 429 and a Retry-After"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "    const bucket = `${routeKey}:${clientIp}:${windowIndex}`\n"
b = "    const bucket = `${clientIp}:${windowIndex}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-9-every-route-shares-a-counter: the counter is keyed by address alone')
