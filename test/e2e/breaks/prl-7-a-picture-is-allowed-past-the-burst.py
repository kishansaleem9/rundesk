# A PICTURE'S BUDGET IS RAISED PAST WHAT THE BURST SENDS (`found-30-sep/public-routes-unthrottled`).
#
# 2,000 a minute instead of 1,200. The image route keeps its policy and its
# guard, so only a burst past the promised budget can tell: the burst of 1,201
# is served whole, and the logo has nothing to come back from after the window.
#
# Reddens: public-route-limits:
#   "a burst of 1,201 asks for a logo from one address: 1,200 are served, ten times a page’s budget for the dozens of pictures one page draws, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "  image: { limit: 1_200, windowMs: 60_000 },\n"
b = "  image: { limit: 2_000, windowMs: 60_000 },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-7-a-picture-is-allowed-past-the-burst: a picture may be asked 2,000 times a minute')
