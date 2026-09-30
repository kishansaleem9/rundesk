# `ram-10`'s edit, claimed by the unit test beside the service.
# Reddens: unit: client-portal.service.test.ts "and revokes none of its portals, answering as for a portal that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    await this.assertProjectManageAccess(portal.projectId, userId, 'Portal not found')\n    await this.db.delete(clientPortals)"
b = '    await this.assertProjectManageAccess(portal.projectId, userId)\n    await this.db.delete(clientPortals)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-2-a-portal-says-its-project-unit: a refused portal is answered as its project')
