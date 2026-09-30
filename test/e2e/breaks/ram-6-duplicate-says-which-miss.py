# DUPLICATE'S MISSES SAY WHICH THEY ARE AGAIN: "Task not found" for an id naming nothing, "Task not found in this
# workspace" for one it found and refused, so the words say the id names a task.
# Reddens: refused-as-missing: "the private task’s own routes answer as its service reads do — its files, following it, Download all, Duplicate, a reminder, its fields and a calendar push each tell the member it is not there, as for an id naming nothing, and nothing is copied"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (!ctx) throw new NotFoundException('Task not found in this workspace')\n    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n    await this.assertTaskOpenTo(workspaceId, taskId, actor)\n\n    const [src] = await this.db\n"
b = "    if (!ctx) throw new NotFoundException('Task not found')\n    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n    await this.assertTaskOpenTo(workspaceId, taskId, actor)\n\n    const [src] = await this.db\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-6-duplicate-says-which-miss: Duplicate answers an id naming nothing in other words')
