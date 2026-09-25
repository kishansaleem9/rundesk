# A LIST'S ADDRESS IS GIVEN AND ROTATED BY ANYBODY WHO READS THE LIST.
# Reddens: share-levels: "a list’s address is given and rotated by whoever may add tasks to it — a member at Full edit, on the admin’s list — and not by a member at Edit (403, none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = "    if (!(await canCreateTaskIn(this.db, listId, actorId))) {\n      throw new ForbiddenException('Only those who may add tasks to this list manage its email address')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-7-address-for-anyone: applied')
