# `ddr-1`'s edit, claimed by the unit test: Duplicate asks no read rule.
#
# Reddens: unit: task-templates.service.test.ts "refuses to duplicate a task the read rule does not find for its caller, and makes nothing"
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
print('ddr-4-duplicate-asks-no-read-rule-unit: Duplicate asks no read rule')
