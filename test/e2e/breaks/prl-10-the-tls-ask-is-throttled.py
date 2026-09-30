# THE TLS PROXY'S ASK IS THROTTLED LIKE A PAGE (`found-30-sep/public-routes-unthrottled`).
#
# `authorizeTls` is given its neighbour's two decorators, as a copy down the
# controller would. It is one machine, the TLS-terminating proxy, asking for
# every host it serves; past 120 asks a minute it is told "no", and a proxy
# told "no" issues no certificate. Custom domains would stop getting HTTPS
# under load, with nothing in the app to say why.
#
# Reddens: public-route-limits: "the machines’ routes are not throttled: the TLS proxy’s ask, an inbound webhook, Stripe’s webhook and the calendar feed each answer a burst of 1,201 from one address as they answer one request, without one 429"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @Get('public/tls/authorize')\n"
b = "  @Get('public/tls/authorize')\n  @UseGuards(RateLimitGuard)\n  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-10-the-tls-ask-is-throttled: the TLS proxy may ask 120 times a minute')
