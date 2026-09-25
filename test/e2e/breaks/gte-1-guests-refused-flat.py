# EVERY GUEST IS REFUSED BEFORE ANY SHARE IS READ, AS IT WAS.
# Re-aimed 25 September: the manager list is stated once now (`role-lists-copied-per-module`); the anchor reads `isManagerRole(...)`.
# Reddens: guest-task-edits: "a guest renames a task shared with them to edit, and a task in a list shared with them to edit — read back"
#   or "on a task shared to comment and assigned to them a guest moves the status — read back — and does not rename it (403)"
#   or "the sheet offers the guest what their share allows: on the task shared to view no title, status or comment box; on the one shared to edit the status, and a new title that saves"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { ConflictException, NotFoundException } from '@nestjs/common'\n"
b = "import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  if (isManagerRole(membership.role)) return ctx\n"
b = "  if (isManagerRole(membership.role)) return ctx\n  if (membership.role === 'guest') throw new ForbiddenException('Guests cannot edit tasks')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('gte-1-guests-refused-flat: every guest is refused before any share is read, as it was')
