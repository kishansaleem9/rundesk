# ANY WORKSPACE ROLE MAY BE GRANTED, `super_admin` included.
# Reddens: credential-reads: "nor may an invitation grant `super_admin` in a workspace, or ownership of the organisation"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.service.ts'
a = '      if (!(INVITE_WORKSPACE_ROLES as readonly string[]).includes(m.role)) {\n'
b = '      if (!m.role) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-6-invite-any-workspace-role: applied")
