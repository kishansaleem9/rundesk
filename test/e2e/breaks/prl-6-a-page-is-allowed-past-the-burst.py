# A PAGE'S BUDGET IS RAISED PAST WHAT THE BURST SENDS (`found-30-sep/public-routes-unthrottled`).
#
# 200 a minute instead of 120. Every page route still carries a policy and the
# guard still reads it, so a test that only asks "is there a limit" passes; the
# budget promised to be far below a flood is not the one enforced. Each page
# route's burst of 121 is served whole, and the three checks that stand on the
# doc refusing somebody say they show nothing.
#
# Reddens: public-route-limits:
#   "a burst of 121 opens of a shared doc from one address in one minute: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 opens of a clip’s link from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 opens of a client portal from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 asks for a custom domain’s branding from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 121 opens of the status page from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address opening the same doc in the same minute is served"
#   "and the route’s alone: the address the doc refuses is still served a clip’s link"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/rate-limit.guard.ts'
a = "  page: { limit: 120, windowMs: 60_000 },\n"
b = "  page: { limit: 200, windowMs: 60_000 },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-6-a-page-is-allowed-past-the-burst: a page may be opened 200 times a minute')
