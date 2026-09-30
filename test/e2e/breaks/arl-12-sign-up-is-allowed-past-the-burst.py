# SIGN-UP'S BUDGET IS TWENTY (`found-30-sep/register-unthrottled`).
#
# Every policy and guard stays in place and the number doubles: the eleventh
# registration, claim and decline in a minute from one address are answered by
# their routes. A budget raised past what the burst sends is what the suite
# states its numbers to notice.
#
# Reddens: auth-route-limits:
#   "a burst of 11 registrations from one address in one minute: 10 are answered by the route (the first makes an account, nine more find the email taken), and the eleventh is refused with 429 and a Retry-After"
#   "the refusal is the address’s alone: another address registering in the same minute makes its account"
#   "a burst of 11 invitation claims from one address: 10 are answered by the route (the first accepts, the rest name no invitation), and the eleventh is refused with 429 and a Retry-After"
#   "a burst of 11 declines of an invitation from one address: 10 are answered, and the eleventh is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/auth-route-limits.ts'
a = '  signUp: { limit: 10, windowMs: 60_000 },\n'
b = '  signUp: { limit: 20, windowMs: 60_000 },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-12-sign-up-is-allowed-past-the-burst: sign-up allows twenty a minute')
