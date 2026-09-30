# A CUSTOM DOMAIN'S BRANDING HAS NO LIMIT (`found-30-sep/public-routes-unthrottled`).
#
# The branding route's `@RateLimit` goes; the guard on the route stays and
# counts nothing. Every ask reads every workspace that set a custom domain, and
# anybody may ask it for any host. The check after the window fails with it,
# since the branding refused nothing and there was nothing to come back from.
#
# Reddens: public-route-limits:
#   "a burst of 121 asks for a custom domain’s branding from one address: 120 are served, and the one past them is refused with 429 and a Retry-After"
#   "after the window the same visitor is served again, on every public route"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = "  @RateLimit(PUBLIC_ROUTE_LIMITS.page)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('prl-4-the-branding-has-no-limit: a custom domain’s branding may be asked without limit')
