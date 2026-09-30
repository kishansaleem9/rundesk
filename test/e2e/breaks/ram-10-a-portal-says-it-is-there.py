# REVOKING A PORTAL OF A PROJECT ITS CALLER MAY NOT OPEN SAYS "Project not found", where a portal id naming
# nothing says "Portal not found": the words say the portal is there.
# Reddens: refused-as-missing: "a client portal of a project the member may not open is not there for them — listing the project’s portals, or revoking one by id — as for ids naming nothing, and it stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    await this.assertProjectManageAccess(portal.projectId, userId, 'Portal not found')\n    await this.db.delete(clientPortals)"
b = '    await this.assertProjectManageAccess(portal.projectId, userId)\n    await this.db.delete(clientPortals)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-10-a-portal-says-it-is-there: a refused portal is answered as its project')
