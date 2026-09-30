# THE SSO LOOKUP HAS NO LIMIT (`found-30-sep/register-unthrottled`).
#
# Its `@RateLimit` goes: one address asks which workspace signs in through SSO
# for any domain as fast as it likes, an enumeration of the instance's SSO
# customers.
#
# Reddens: auth-route-limits:
#   "a burst of 61 SSO lookups from one address: 60 are answered, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = "  @Get('lookup')\n  @RateLimit(AUTH_ROUTE_LIMITS.ssoLookup)\n"
b = "  @Get('lookup')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-9-the-sso-lookup-has-no-limit: the SSO lookup has no limit')
