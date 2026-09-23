# A MANAGER MAY INVITE A WORKSPACE ADMIN, as one could.
# Reddens: credential-reads: "a manager may invite a member but not a workspace admin — nobody grants more than they hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (membership.role === 'manager' && body.role === 'workspace_admin') {\n"
b = "    if (membership.role === 'manager' && body.role === 'owner') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-8-manager-grants-admin: applied")
