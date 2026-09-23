# THE LIST CARRIES THE SECRET TO THE PEOPLE WHO MANAGE A WORKSPACE — in every list and every sign-in answer.
# Reddens: credential-reads: "and even their list of workspaces leaves it out — it is read where it is used"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '      .orderBy(asc(workspaceMembers.joinedAt))\n    return rows.map((r) => ({ ...r, workspace: withoutDomainToken(r.workspace) }))\n'
b = "      .orderBy(asc(workspaceMembers.joinedAt))\n    return rows.map((r) => ({ ...r, workspace: ['workspace_admin', 'manager'].includes(r.role) ? r.workspace : withoutDomainToken(r.workspace) }))\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-18-list-carries-token-for-admins: applied")
