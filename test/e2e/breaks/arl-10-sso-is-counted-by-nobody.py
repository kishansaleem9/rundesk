# SSO'S POLICIES ARE READ BY NOBODY (`found-30-sep/register-unthrottled`).
#
# The sign-in controller loses `RateLimitGuard` and keeps its four `@RateLimit`
# policies: labels nothing reads. The lookup, the start (a discovery fetch and
# a login state per ask) and both callbacks answer any number from one address.
#
# Reddens: auth-route-limits:
#   "a burst of 61 SSO lookups from one address: 60 are answered, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 SSO sign-in starts from one address: 30 are answered by the route, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 OIDC callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After"
#   "a burst of 31 SAML callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = '@UseGuards(RateLimitGuard)\nexport class SsoAuthController {\n'
b = 'export class SsoAuthController {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-10-sso-is-counted-by-nobody: nothing reads the SSO policies')
