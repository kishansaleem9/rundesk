# THE PROJECT'S FIELD LIST CHECKS THE WORKSPACE ONLY, as it did.
# Reddens: custom-field-access: "a member cannot read the fields of a project they are refused, nor a task’s values there (404 each) — while they read an open one’s, and the admin reads the refused one’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '  async listForProject(workspaceId: string, projectId: string, reader?: ReadActor) {\n    await this.assertProjectOpenTo(workspaceId, projectId, reader)\n'
b = '  async listForProject(workspaceId: string, projectId: string, reader?: ReadActor) {\n    await this.assertProjectInWorkspace(workspaceId, projectId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-3-list-skips-the-reader: applied")
