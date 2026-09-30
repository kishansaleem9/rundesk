# Save as template stops asking the task's read rule: the template key is all
# it asks, so a member holding it snapshots a private task they are refused.
#
# Reddens: create-modal-templates: "and granted Manage templates, cannot save it as a template: 404, and no template holds it"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

    const payload = await this.snapshotTask(taskId, ctx, { forTemplate: true })
"""
b = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')

    const payload = await this.snapshotTask(taskId, ctx, { forTemplate: true })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-templates.service.ts: Save as template snapshots a task whoever asks.')
