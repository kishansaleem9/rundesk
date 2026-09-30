# A CLAIM READS ITS CALLER'S TOKEN FOR ITS SIGNATURE ALONE AGAIN, READ FROM THE CONTROLLER (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# `sip-47`'s edit, claimed by the unit test: a token whose session has ended
# claims as its person.
#
# Reddens: unit: invitations.controller.test.ts "the claimant is read from the access cookie as from the Bearer header, only while its session is live, and a token that does not verify is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (!(await sessionIsLive(this.db, payload))) return undefined\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-48-a-claim-asks-no-session-unit: a claim takes any token that verifies')
