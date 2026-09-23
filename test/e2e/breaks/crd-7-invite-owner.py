# AN INVITATION MAY MAKE SOMEBODY OWNER OF THE ORGANISATION.
# Reddens: credential-reads: "nor may an invitation grant `super_admin` in a workspace, or ownership of the organisation"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '    if (!(INVITE_ORG_ROLES as readonly string[]).includes(orgRole)) {\n'
b = '    if (!orgRole) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-7-invite-owner: applied")
