# A MANAGER MAY INVITE NOBODY: the refusal half with no grant half.
# Reddens: credential-reads: "a manager may invite a member but not a workspace admin — nobody grants more than they hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (membership.role === 'manager' && body.role === 'workspace_admin') {\n"
b = "    if (membership.role === 'manager') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-9-manager-invites-nobody: applied")
