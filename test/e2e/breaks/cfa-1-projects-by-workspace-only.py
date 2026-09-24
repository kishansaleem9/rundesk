# A PROJECT'S FIELDS BY WORKSPACE ALONE, as they were: every project-scoped route open to any member.
# Reddens: custom-field-access: "a member cannot define a field in a project they are refused, from the project or from its task (404 each, none made) — while they define one in an open project"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (!reader) return this.assertProjectInWorkspace(workspaceId, projectId)\n    if (!(await readableProject(this.db, workspaceId, projectId, reader))) throw new NotFoundException('Project not found in this workspace')\n"
b = '    return this.assertProjectInWorkspace(workspaceId, projectId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-1-projects-by-workspace-only: applied")
