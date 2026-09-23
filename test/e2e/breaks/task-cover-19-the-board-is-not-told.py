# The cover is cleared, and nobody drawing the list is told.
#
# The task and the list endpoint are right, so both API checks pass. The board
# behind the sheet refetches its tasks only on the list's realtime events, so
# without one the card goes on drawing the URL it already had, now to a deleted
# object, until the page is reloaded.
#
# Reddens: task-cover: "removing that attachment in the sheet takes the cover off the board card behind it, with no reload"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        this.realtime.emitToList(listId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })\n"
b = "        void listId\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: clearing the cover emits nothing to the list.')
