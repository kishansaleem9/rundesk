# ADDING A MEMBER FINDS THEIR EMAIL ONLY AS IT WAS TYPED AGAIN (`found-30-sep/sign-in-reads-the-email-as-typed`).
#
# `addMember` compares the email exactly as stored, so a person whose account
# is in lower case cannot be added by their email typed with a capital: "No
# user with email".
#
# Reddens: sign-in-and-password:
#   "a member is added by their email typed with a capital: 201, and they are in the workspace as a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "      .where(sameEmail(users.email, String(email ?? '')))\n"
b = "      .where(eq(users.email, String(email ?? '')))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sip-8-a-member-is-found-as-typed: adding a member compares the email as stored')
