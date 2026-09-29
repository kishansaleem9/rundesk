# A LINE TYPED BY SOMEBODY ELSE LANDS ON YOUR PRIORITIES (`ledger-rows/row-850`): the task-only rule gives way to a title.
# Reddens: unit: people.service.test.ts "puts only a task on somebody else's list, never a typed line (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "    if (!taskId) throw new BadRequestException(\"Only a task can be added to somebody else's priorities\")\n"
b = "    if (!taskId) return this.insertPriority(workspaceId, userId, { taskId: null, title: input.title?.trim() || null }, caller.id)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-20-a-typed-line-goes-on-a-colleagues-list-unit: a typed line is written onto a colleague\'s list')
