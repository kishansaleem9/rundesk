# `restore` clears `archivedAt` and `archivedById` and leaves `isArchived` set.
#
# Every restore in the service — space, folder, project, list, task — shares one
# `clear` object, so this single edit makes all of them report success and
# restore nothing. The item leaves the Trash listing (which reads `archivedAt`)
# and stays invisible everywhere else, which is the worst of the two states and
# the one the task branch's own comment warns about three screens below.
#
# THIS IS THE PATCH THE SUITE COULD NOT SEE UNTIL TODAY. Three of its checks
# called `POST …/restore` and asserted `status < 300`; this patch answers 200
# to all three. Only the browser check, which reads the list back through
# `/lists/project/:id`, would have caught it — so a regression in the project
# or space path would have gone through green. Those three now read their row
# back, and this patch reddens four checks instead of one.
#
# Dropping `isArchived: false` from an object literal is the kind of edit that
# happens when two flags are being consolidated and one of them looks
# redundant: `archivedAt: null` reads like it says everything.
#
# Reddens: undo-delete: "and the row is un-archived afterwards, not merely answered for"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
a = "    const clear = { isArchived: false, archivedAt: null, archivedById: null, updatedAt: new Date() }"
b = "    const clear = { archivedAt: null, archivedById: null, updatedAt: new Date() }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trash.service.ts: restore now clears the archive date and leaves the archive flag set.')
