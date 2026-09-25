# THE PENDING LIST CARRIES EACH INVITATION'S TOKEN.
# Reddens: guest-invitations: "an invitation’s token reaches only those who may copy its link: the member’s list carries none, and the link is refused to a member and given to the admin"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          email: invite.email,\n          role: workspaceMembership?.role ?? 'member',\n"
b = "          email: invite.email,\n          token: invite.token,\n          role: workspaceMembership?.role ?? 'member',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("gin-2-list-carries-the-token: the pending list carries each invitation's token")
