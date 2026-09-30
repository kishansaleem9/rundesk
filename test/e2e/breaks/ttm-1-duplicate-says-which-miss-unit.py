# `ram-6`'s edit, claimed by the unit test beside the service.
# Reddens: unit: task-templates.service.test.ts "answers a task that is not there in the words it answers one its caller may not open"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (!ctx) throw new NotFoundException('Task not found in this workspace')\n    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n    await this.assertTaskOpenTo(workspaceId, taskId, actor)\n\n    const [src] = await this.db\n"
b = "    if (!ctx) throw new NotFoundException('Task not found')\n    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n    await this.assertTaskOpenTo(workspaceId, taskId, actor)\n\n    const [src] = await this.db\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ttm-1-duplicate-says-which-miss-unit: Duplicate answers an id naming nothing in other words')
