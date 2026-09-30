# `ddr-2`'s edit, claimed by the unit test: Save as template asks no read rule.
#
# Reddens: unit: task-templates.service.test.ts "refuses to save such a task as a template, and saves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')
    await this.assertTaskOpenTo(workspaceId, taskId, actor)

    const payload = await this.snapshotTask(taskId, { forTemplate: true })
"""
b = """    if (ctx.workspaceId !== workspaceId) throw new NotFoundException('Task not found in this workspace')

    const payload = await this.snapshotTask(taskId, { forTemplate: true })
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ddr-5-save-asks-no-read-rule-unit: Save as template asks no read rule')
