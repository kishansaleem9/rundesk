# A PROJECT NAMED BY ID IS READ WHEREVER IT IS, as it was.
# Reddens: ai-read-access: "a project the member may not open, named by id, is planned as no project at all — the open one, named by id, is planned by its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '      .where(and(eq(projects.id, projectId), eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, reader.id, isManager)))\n'
b = '      .where(eq(projects.id, projectId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-3-any-project-by-id: applied")
