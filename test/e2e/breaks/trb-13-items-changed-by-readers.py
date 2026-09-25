# CHANGING AN ITEM ASKS NOTHING OF THE TASK'S LEVEL.
# Re-aimed 25 September: a tick of one's own item asks the comment rule now, and everything else the edit rule (`assigned-checklist-items-need-edit`); the patch takes the level away from both.
# Reddens: task-rows-by-id: "a member in a view-only space changes none of a task’s checklists or its type there (403, unchanged) — where in an open space they make a checklist and tick an item"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!(tickOfTheirOwn && (await taskCommentAllowed(this.db, taskId, actorId)))) {\n      await this.assertTaskWriteAccess(taskId, actorId)\n    }\n"
b = "    void tickOfTheirOwn\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-13-items-changed-by-readers: changing an item asks nothing of the task's level")
