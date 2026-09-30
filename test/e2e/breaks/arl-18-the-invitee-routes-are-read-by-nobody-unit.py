# THE INVITEE'S POLICIES ARE READ BY NOBODY (`found-30-sep/register-unthrottled`).
#
# The invitations controller loses `RateLimitGuard` and keeps the claim's, the
# decline's and the preview's `@RateLimit`: labels nothing reads.
#
# Reddens: unit: auth-route-limits.test.ts "POST /invitations/claim carries the signUp budget, and RateLimitGuard reads it"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = '@UseGuards(RateLimitGuard)\nexport class InvitationsController {\n'
b = 'export class InvitationsController {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-18-the-invitee-routes-are-read-by-nobody-unit: nothing reads the invitee policies')
