# A CLAIM READS ITS CALLER FROM THE BEARER HEADER ALONE AGAIN (`found-30-sep/an-accepted-invitation-sets-no-cookies`).
#
# The access cookie is not read, and the web sends a Bearer header only while a
# page load holds the token in memory, so a person signed in by their cookies
# (any page reloaded, or the invitation opened from its email in a new tab) is
# taken for nobody and told "Account already exists. Please log in first."
#
# Reddens: sign-in-and-password:
#   "a person signed in by their cookies alone (no Bearer header, as a reloaded page is) accepts an invitation to their account: 201, and they are in the workspace as a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    const token = cookieOrBearerExtractor(req as never)\n"
b = (
    "    const authorization = String((req as { headers?: Record<string, unknown> })?.headers?.authorization ?? '')\n"
    "    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null\n"
)
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-53-a-claim-reads-the-bearer-alone: the claim reads the Bearer header alone')
