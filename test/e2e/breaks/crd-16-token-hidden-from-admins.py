# NOBODY READS THE DOMAIN SECRET, the people who must put it in DNS included.
# Reddens: credential-reads: "while the admin and the manager, who may change the domain, still read it for the DNS record"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = '    return WORKSPACE_ADMIN_ROLES.includes(req.workspaceMember?.role) ? ws : withoutDomainToken(ws)\n'
b = '    return WORKSPACE_ADMIN_ROLES.includes(req.workspaceMember?.role) ? withoutDomainToken(ws) : withoutDomainToken(ws)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-16-token-hidden-from-admins: applied")
