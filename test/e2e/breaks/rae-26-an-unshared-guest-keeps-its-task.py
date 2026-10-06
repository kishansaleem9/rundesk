# A GUEST WHOSE SHARE OF A LIST IS REMOVED KEEPS ITS TASK’S ROOM (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A guest hears a task only while it is in their reach (`guest-reach.ts`), and
# the room pass asks that again. Let a guest pass for any task and a guest whose
# share of a list was removed keeps the room of the task they held in it, and
# hears a comment made there. A member lowered to guest holds no task room, so
# this reddens the guest's check alone (`rae-3` reddens both).
#
# Reddens: realtime-access-ends:
#   "a guest whose share of a list is removed stops hearing the list and its task on a socket already open, while a member hears both"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "await guestMayRead(this.db, userId, 'task', id) : await guestReachesList(this.db, userId, listId)"
b = 'true : await guestReachesList(this.db, userId, listId)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-26-an-unshared-guest-keeps-its-task: a guest passes for any task')
