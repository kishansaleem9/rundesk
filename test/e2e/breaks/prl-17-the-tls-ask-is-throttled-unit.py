# THE TLS PROXY'S ASK IS THROTTLED LIKE A PAGE, READ FROM ITS METADATA (`found-30-sep/public-routes-unthrottled`).
#
# `prl-10`'s edit, claimed by the unit test: `authorizeTls` carries a page's
# policy and the guard, so the proxy is told "no" past 120 asks a minute and
# issues no certificate.
#
# Reddens: unit: public-route-limits.test.ts "the TLS proxy asking whether to issue a certificate (GET /public/tls/authorize): never throttled, with no policy and no RateLimitGuard"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @Get('public/tls/authorize')\n"
b = "  @Get('public/tls/authorize')\n  @UseGuards(RateLimitGuard)\n  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-17-the-tls-ask-is-throttled-unit: the TLS proxy may ask 120 times a minute')
