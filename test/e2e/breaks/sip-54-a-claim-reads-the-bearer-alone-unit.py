# A CLAIM READS ITS CALLER FROM THE BEARER HEADER ALONE AGAIN, READ FROM THE CONTROLLER (`found-30-sep/an-accepted-invitation-sets-no-cookies`).
#
# `sip-53`'s edit, claimed by the unit test: a claimant signed in by cookie is
# nobody.
#
# Reddens: unit: invitations.controller.test.ts "the claimant is read from the access cookie as from the Bearer header, only while its session is live, and a token that does not verify is refused"
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
print('sip-54-a-claim-reads-the-bearer-alone-unit: the claim reads the Bearer header alone')
