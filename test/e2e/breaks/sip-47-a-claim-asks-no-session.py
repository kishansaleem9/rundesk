# A CLAIM READS ITS CALLER'S TOKEN FOR ITS SIGNATURE ALONE AGAIN (`found-30-sep/revoked-sessions-keep-their-access-tokens`).
#
# The claim no longer asks whether the token's session is live, so a session a
# password change has ended accepts invitations for its account, as it could
# before, for the minutes its access token has left.
#
# Reddens: sign-in-and-password:
#   "a session that has ended claims no invitation for its account: the claim reads its token as nobody’s and is refused 403 \"Account already exists\", and the account joins nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (!(await sessionIsLive(this.db, payload))) return undefined\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-47-a-claim-asks-no-session: a claim takes any token that verifies')
