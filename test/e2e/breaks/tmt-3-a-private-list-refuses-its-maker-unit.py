# A MOVE FORGETS WHO MADE A PRIVATE LIST: its maker is refused it too, so a refusal check alone would pass a rule
# that refuses every move into a private list.
# Reddens: unit: task-move-target.test.ts "and moves the task into the mover’s own private list, so the refusals above are about whose list it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        { visibility: target.listVisibility, createdById: target.listCreatedById, personalOf: target.listPersonalOf },\n'
b = '        { visibility: target.listVisibility, createdById: null, personalOf: target.listPersonalOf },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tmt-3-a-private-list-refuses-its-maker-unit: a private list’s maker is refused it')
