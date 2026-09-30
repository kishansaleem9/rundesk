# THE TASK READ RULE TELLS A STRANGER "Workspace not found" AGAIN, where a task that is not there is "Task not
# found": the words say the task is somebody's.
# Reddens: unit: tasks-security.test.ts "refuses a non-member (no workspace membership row) as the task that is not there"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const access = await this.containerReadAccess(ctx, actorId)\n    if (!access) throw notThere()\n'
b = "    const access = await this.containerReadAccess(ctx, actorId)\n    if (!access) throw new NotFoundException('Workspace not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsr-1-a-stranger-is-told-no-workspace-unit: a stranger is told the workspace is not found')
