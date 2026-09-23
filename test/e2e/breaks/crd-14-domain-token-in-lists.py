# THE MEMBER LIST, AND SO THE SIGN-IN ANSWER, CARRIES THE DOMAIN SECRET.
# Reddens: credential-reads: "a member and a guest read the workspace every way it is listed — by id, in their list, in the sign-in answer, among archived ones — and none carries it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '      .orderBy(asc(workspaceMembers.joinedAt))\n    return rows.map((r) => ({ ...r, workspace: withoutDomainToken(r.workspace) }))\n'
b = '      .orderBy(asc(workspaceMembers.joinedAt))\n    return rows\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-14-domain-token-in-lists: applied")
