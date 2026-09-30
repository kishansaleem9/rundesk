# Duplicate stops asking the task's read rule, as it was before
# `found-30-sep/duplicate-reads-what-its-caller-cannot`: membership and the
# right to add to the list are all it asks, so a member refused a private task
# copies it and reads its words from the copy.
#
# RE-ANCHORED (`found-30-sep/private-task-reads-say-403`): the lines above the read rule changed words.
# Reddens: create-modal-templates: "a member refused a private task cannot duplicate it: 404, no copy is made, and none of its words come back"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n    await this.assertTaskOpenTo(workspaceId, taskId, actor)\n\n    const [src] = await this.db\n"
b = "    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')\n\n    const [src] = await this.db\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ddr-1-duplicate-asks-no-read-rule: Duplicate copies a task whoever asks')
