# Duplicate stops asking the task's read rule, as it was before
# `found-30-sep/duplicate-reads-what-its-caller-cannot`: membership and the
# right to add to the list are all it asks, so a member refused a private task
# copies it and reads its words from the copy.
#
# Re-aimed 8 October (batch 19): Duplicate reads what the copy takes before the task (`duplicate-copies-no-attachments`)
# Reddens: create-modal-templates: "a member refused a private task cannot duplicate it: 404, no copy is made, and none of its words come back"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

    const [src] = await this.db
"""
b = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')

    const [src] = await this.db
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-templates.service.ts: Duplicate copies a task whoever asks.')
