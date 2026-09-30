# AN INTEGRATION'S OAUTH CALLBACK IS COUNTED BY NOBODY (`found-30-sep/oauth-routes-unthrottled`).
#
# The callback loses `RateLimitGuard` and keeps its policy: a label nothing
# reads, since no guard of the controller's class is there to read it.
#
# Reddens: unit: auth-route-limits.test.ts "GET /integrations/oauth/:provider/callback carries the oauthRedirect budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.controller.ts'
a = "  @Get('integrations/oauth/:provider/callback')\n  @UseGuards(RateLimitGuard)\n"
b = "  @Get('integrations/oauth/:provider/callback')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-28-the-integration-callback-is-read-by-nobody-unit: the integration callback runs without the limiter')
