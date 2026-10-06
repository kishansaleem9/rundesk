# A TASK MOVES INTO A LIST WHOSE PROJECT IS IN THE TRASH. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: unit: task-move-target.test.ts "refuses a list whose project is in the trash, 409, naming the project, and moves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const held = nearestHolderInTrash(target)\n    if (held) {\n'
b = "    const held = nearestHolderInTrash(target)\n    if (held && actorId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tmt-8-a-task-moves-into-a-held-list-unit: a move asks nothing of what holds the list')
