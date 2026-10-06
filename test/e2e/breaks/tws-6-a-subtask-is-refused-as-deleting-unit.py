# ADDING A SUBTASK IS REFUSED IN THE WORDS FOR DELETING A TASK (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
# Reddens: unit: task-write.test.ts "refuses a parent where the space’s default is Edit, saying it does not allow adding subtasks to its tasks"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'adding subtasks to its' })\n"
b = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'deleting its' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tws-6-a-subtask-is-refused-as-deleting-unit: a subtask refused as deleting')
