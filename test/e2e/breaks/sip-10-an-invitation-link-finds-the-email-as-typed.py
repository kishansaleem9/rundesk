# AN INVITATION'S LINK FINDS AN ACCOUNT ONLY AS ITS EMAIL WAS STORED AGAIN (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# The preview's check whether the invitee already has an account compares the
# email exactly as stored, so the link of an invitation to an account stored
# with capitals says an account needs making.
#
# Reddens: sign-in-and-password:
#   "an invitation to that account’s email in lower case finds the account: its link says no account needs making, and claiming it without signing in is refused 403, making none"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = "      .where(sameEmail(users.email, invite.invite.email))\n"
b = "      .where(eq(users.email, invite.invite.email))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-10-an-invitation-link-finds-the-email-as-typed: the preview compares the email as stored')
