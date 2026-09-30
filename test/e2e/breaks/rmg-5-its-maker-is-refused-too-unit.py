# THE GUARD FORGETS WHO MADE A PRIVATE TASK: its maker is refused it too, so a refusal check alone would pass a
# guard that refuses everybody.
# Reddens: unit: resource-member.guard.test.ts "the same member opens the task once it is theirs to open, so the refusals above are about the task"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
a = '          { visibility: item.taskVisibility, createdById: item.taskCreatedById },\n'
b = '          { visibility: item.taskVisibility, createdById: null },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rmg-5-its-maker-is-refused-too-unit: a private task’s maker is refused it')
