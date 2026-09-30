# CLAIMING AN INVITATION FINDS AN ACCOUNT ONLY AS ITS EMAIL WAS STORED AGAIN (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# The claim's check that the invitee has no account compares the email
# exactly as stored, so an account stored with capitals is not found, and a
# claim without signing in makes a second account beside it.
#
# Reddens: sign-in-and-password:
#   "an invitation to that account’s email in lower case finds the account: its link says no account needs making, and claiming it without signing in is refused 403, making none"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = "        const [existing] = await tx.select().from(users).where(sameEmail(users.email, invite.email)).limit(1)\n"
b = "        const [existing] = await tx.select().from(users).where(eq(users.email, invite.email)).limit(1)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-9-a-claim-finds-the-email-as-typed: the claim compares the email as stored')
