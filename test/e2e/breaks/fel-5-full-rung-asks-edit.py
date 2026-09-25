# THE TASK RULE'S FULL EDIT RUNG ASKS EDIT.
# Reddens: full-edit-levels: "where a space’s default is Edit a member changes the admin’s task and archives one, and adds no task or list and deletes no task (403 each, none made, none in the Trash) — in a Full edit space they add and delete"
#   or "a grant at Edit — a task shared at Edit, a space role of Edit, a project role of Edit — changes a task and deletes none (403, not in the Trash); a task shared at Full edit is deleted"
#   or "the sheet offers Delete only with Full edit: on a task shared at Edit its menu has Archive and not Delete, on one shared at Full edit both — as the API answers"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'admin', kind: 'tasks', within, act: 'deleting its' })"
b = "    await assertSpaceLevel(db, { spaceId, actorId, required: 'edit', kind: 'tasks', within, act: 'deleting its' })"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("fel-5-full-rung-asks-edit: the task rule's full edit rung asks edit")
