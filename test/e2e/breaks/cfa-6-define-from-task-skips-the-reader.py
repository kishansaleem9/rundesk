# DEFINING A FIELD FROM A TASK CHECKS ONLY THE WORKSPACE, and hands no reader on, as it did.
# Reddens: custom-field-access: "a member cannot define a field in a project they are refused, from the project or from its task (404 each, none made) — while they define one in an open project"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    const task = await this.assertTaskOpenTo(workspaceId, taskId, reader)\n    if (dto.scope !== undefined'
b = '    const task = await this.assertTaskInWorkspace(workspaceId, taskId)\n    reader = undefined\n    if (dto.scope !== undefined'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-6-define-from-task-skips-the-reader: applied")
