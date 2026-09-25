# A PROJECT IS SAVED AS A TEMPLATE IF IT IS IN THE WORKSPACE, AS IT WAS: the designer saves the private project.
# Reddens: project-template-key: "the designer’s template holds the task they read and not the private one — the manager’s, who reads it, holds both — and a project the designer cannot open is saved by nobody’s key (404, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const project = isUuid(dto.projectId) ? await readableProject(this.db, workspaceId, dto.projectId, actor) : null\n'
b = "    const project = isUuid(dto.projectId) ? await readableProject(this.db, workspaceId, dto.projectId, { id: actor.id, role: 'super_admin' }) : null\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ptk-3-any-project-in-the-workspace: the project read as a platform admin')
