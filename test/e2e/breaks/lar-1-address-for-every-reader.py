# A LIST'S ADDRESS IS ANSWERED TO EVERY READER OF THE LIST, as it was.
# Reddens: list-address-readers: "a list’s address is read by those who may add tasks to it: refused to a member of a view-only space and to a guest with a view share (403, no address in either answer), given to a member at Full edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = "    if (!(await canCreateTaskIn(this.db, listId, readerId))) {\n      throw new ForbiddenException('Only those who may add tasks to this list see its email address')\n    }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-1-address-for-every-reader: applied')
