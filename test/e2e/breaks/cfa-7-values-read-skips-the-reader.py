# A TASK'S VALUES READ BY WORKSPACE ALONE, as they were.
# Reddens: custom-field-access: "a member cannot read the fields of a project they are refused, nor a task’s values there (404 each) — while they read an open one’s, and the admin reads the refused one’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '  async getValuesForTask(workspaceId: string, taskId: string, reader?: ReadActor) {\n    const task = await this.assertTaskOpenTo(workspaceId, taskId, reader)\n'
b = '  async getValuesForTask(workspaceId: string, taskId: string, reader?: ReadActor) {\n    const task = await this.assertTaskInWorkspace(workspaceId, taskId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-7-values-read-skips-the-reader: applied")
