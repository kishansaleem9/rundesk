# GOOGLE'S SIGN-IN IS COUNTED BY NOBODY (`found-30-sep/oauth-routes-unthrottled`).
#
# The OAuth controller loses `RateLimitGuard` and its two policies stay: labels
# that nothing reads, so the start and the callback answer every ask.
#
# Reddens: auth-route-limits:
#   "a burst of 31 starts of signing in with Google from one address: 30 are sent on, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 Google sign-in callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/oauth.controller.ts'
a = "@Controller('auth/oauth')\n@UseGuards(RateLimitGuard)\nexport class OAuthController {\n"
b = "@Controller('auth/oauth')\nexport class OAuthController {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-24-google-sign-in-is-counted-by-nobody: the OAuth controller runs without the limiter')
