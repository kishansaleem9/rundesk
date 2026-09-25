# SENDING A TASK TO THE TRASH ASKS EDIT, AS IT DID.
# Reddens: full-edit-levels: "where a space’s default is Edit a member changes the admin’s task and archives one, and adds no task or list and deletes no task (403 each, none made, none in the Trash) — in a Full edit space they add and delete"
#   or "a grant at Edit — a task shared at Edit, a space role of Edit, a project role of Edit — changes a task and deletes none (403, not in the Trash); a task shared at Full edit is deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true, level: 'full' })"
b = '    await this.assertTaskWriteAccess(taskId, actorId, { allowArchived: true })'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-4-trash-asks-edit: sending a task to the trash asks edit, as it did')
