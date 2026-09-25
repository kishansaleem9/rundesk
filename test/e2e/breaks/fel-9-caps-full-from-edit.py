# THE SHEET'S FULL EDIT ANSWER IS THE EDIT RULE'S.
# Reddens: full-edit-levels: "the sheet offers Delete only with Full edit: on a task shared at Edit its menu has Archive and not Delete, on one shared at Full edit both — as the API answers"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      allowed(this.assertTaskWriteAccess(taskId, actorId, { level: 'full' })),"
b = '      allowed(this.assertTaskWriteAccess(taskId, actorId)),'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("fel-9-caps-full-from-edit: the sheet's full edit answer is the edit rule's")
