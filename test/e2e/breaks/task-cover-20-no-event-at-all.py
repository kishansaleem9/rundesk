# The cover is cleared and no event goes out at all, to the list or the task.
#
# The sheet refetches its own task, so its banner is right; nothing refetches
# the list, so even the board behind the sheet keeps the deleted image.
#
# Reddens: task-cover: "removing that attachment in the sheet takes the cover off the board card behind it, with no reload"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = ("        this.realtime.emitToList(listId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })\n"
     "        this.realtime.emitToTask(taskId, { type: 'task.updated', listId, taskId, patch: { coverStorageKey: null } })\n")
b = "        void listId\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("task-cover-20-no-event-at-all: applied")
