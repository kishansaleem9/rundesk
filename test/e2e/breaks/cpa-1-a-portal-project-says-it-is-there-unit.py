# MANAGING THE PORTALS OF A PROJECT ITS CALLER MAY NOT OPEN SAYS 403 "This space or project is private" AGAIN.
# Reddens: unit: client-portal.service.test.ts "lists no portal of it, answering as for a project that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = '    if (!(await readableProject(this.db, proj.workspaceId, proj.projectId, { id: userId, role: account?.role ?? null }))) {\n      throw new NotFoundException(notThere)\n    }\n'
b = "    if (!(await readableProject(this.db, proj.workspaceId, proj.projectId, { id: userId, role: account?.role ?? null }))) {\n      throw new ForbiddenException('This space or project is private')\n    }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpa-1-a-portal-project-says-it-is-there-unit: a refused project is a 403')
