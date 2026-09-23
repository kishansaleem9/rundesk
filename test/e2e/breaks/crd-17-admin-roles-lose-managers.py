# THE DOMAIN'S RECORD WITHOUT MANAGERS: a manager may change the domain but not read what to put in DNS.
# Reddens: credential-reads: "while the admin and the manager, who may change the domain, still read it for the DNS record"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = '    return isManagerRole(req.workspaceMember?.role) ? ws : withoutDomainToken(ws)\n'
b = "    return ['workspace_admin', 'super_admin'].includes(req.workspaceMember?.role) ? ws : withoutDomainToken(ws)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-17-admin-roles-lose-managers: applied")
