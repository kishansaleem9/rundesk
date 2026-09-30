# THE OAUTH REDIRECTS' BUDGET IS SIXTY (`found-30-sep/oauth-routes-unthrottled`).
#
# Every policy and guard stays in place and the number doubles: the 31st start,
# sign-in callback and integration callback in a minute from one address are
# answered. A budget raised past what the burst sends is what the suite states
# its numbers to notice.
#
# Reddens: auth-route-limits:
#   "a burst of 31 starts of signing in with Google from one address: 30 are sent on, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 Google sign-in callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 integration OAuth callbacks from one address: 30 are sent back to the app, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/common/guards/auth-route-limits.ts'
a = '  oauthRedirect: { limit: 30, windowMs: 60_000 },\n'
b = '  oauthRedirect: { limit: 60, windowMs: 60_000 },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-26-an-oauth-redirect-is-allowed-past-the-burst: the OAuth redirects allow sixty a minute')
