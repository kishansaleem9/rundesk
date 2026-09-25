# A MANAGER MAY INVITE A WORKSPACE ADMIN, as one could.
# Re-aimed: the rank rule is `roleRank(body.role) > own` now (settings-tabs-by-key); one rank's slack lets a manager invite an admin.
# Reddens: credential-reads: "a manager may invite a member but not a workspace admin — nobody grants more than they hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/invitations/invitations.controller.ts'
a = "    if (roleRank(body.role ?? 'member') > own) {\n"
b = "    if (roleRank(body.role ?? 'member') > own + 1) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-8-manager-grants-admin: applied")
