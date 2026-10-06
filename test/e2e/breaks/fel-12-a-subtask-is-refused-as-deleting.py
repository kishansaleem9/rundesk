# ADDING A SUBTASK IS REFUSED IN THE WORDS FOR DELETING A TASK (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
# Reddens: full-edit-levels: "a member at Edit adds no subtask under a task there — by making one with that parent, or by moving their own task under it — and is told so, 403, “…which does not allow adding subtasks to its tasks”, none made; in a Full edit space they add one"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'adding subtasks to its' })\n"
b = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'deleting its' })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-12-a-subtask-is-refused-as-deleting: a subtask refused as deleting')
