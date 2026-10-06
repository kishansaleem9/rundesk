# A SUBTASK'S PARENT ASKS EDIT, NOT FULL EDIT: a member at Edit adds subtasks.
# Re-aimed 6 October: a parent is asked Full edit as 'subtask', which says what it refuses (`found-6-oct/adding-a-subtask-is-refused-as-deleting`).
# Reddens: other-task-rules: "a member hangs no subtask under a task they may only read — neither a new one nor their own task moved there (403 each, nothing under it) — nor under one they may only Edit, and under one at Full edit they do both"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    await this.assertTaskWriteAccess(parentTaskId, actorId, { level: 'subtask' })\n"
b = "    await this.assertTaskWriteAccess(parentTaskId, actorId, { level: 'edit' })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('otr-4-parents-at-edit: applied')
