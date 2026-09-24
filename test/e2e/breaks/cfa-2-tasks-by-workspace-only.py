# A TASK'S FIELDS BY WORKSPACE ALONE, as they were: its values read and written by any member.
# Reddens: custom-field-access: "a member cannot set a field on a task of a space they are refused (404, the value unchanged) — while they set one on an open task"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if (reader && !(await readableTask(this.db, workspaceId, taskId, reader))) throw new NotFoundException('Task not found in this workspace')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cfa-2-tasks-by-workspace-only: applied")
