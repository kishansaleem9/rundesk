# Duplicate stops asking the task's read rule, as it was before
# `found-30-sep/duplicate-reads-what-its-caller-cannot`: membership and the
# right to add to the list are all it asks, so a member refused a private task
# copies it and reads its words from the copy.
#
# Reddens: create-modal-templates: "a member refused a private task cannot duplicate it: 404, no copy is made, and none of its words come back"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = """  async duplicateTask(workspaceId: string, taskId: string, actor: { id: string; email?: string; role?: string | null }) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)
"""
b = """  async duplicateTask(workspaceId: string, taskId: string, actor: { id: string; email?: string; role?: string | null }) {
    const ctx = await this.resolveTaskContext(taskId)
    if (!ctx) throw new NotFoundException('Task not found')
    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-templates.service.ts: Duplicate copies a task whoever asks.')
