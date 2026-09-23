# THE WORKSPACE BY ID CARRIES THE DOMAIN SECRET TO EVERY MEMBER, as it did.
# Reddens: credential-reads: "a member and a guest read the workspace every way it is listed — by id, in their list, in the sign-in answer, among archived ones — and none carries it"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = '    return isManagerRole(req.workspaceMember?.role) ? ws : withoutDomainToken(ws)\n'
b = '    return ws\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-13-domain-token-by-id: applied")
