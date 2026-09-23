# The cover is cleared, and nobody drawing the list is told.
#
# The task and the list endpoint are right, so both API checks pass. A board
# refetches its tasks on the list's realtime events, so a teammate's board goes
# on drawing the URL it already had, now to a deleted object, until the page is
# reloaded. (Re-aimed: it first claimed the check on the board BEHIND the sheet,
# and reddened nothing, 41/41, because that board also hears the task's event
# through the sheet's own subscription.)
#
# Reddens: task-cover: "and so does a second board open at the same time, where nobody touched the sheet"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        this.realtime.emitToList(listId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })\n"
b = "        void listId\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: clearing the cover emits nothing to the list.')
