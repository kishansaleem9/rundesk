# A DELETED LIST’S ADDRESS CAN NO LONGER BE ROTATED OR SWITCHED OFF, as after the trash refusal reached the
# address’s routes as a plain no — while mail to it went on.
# Reddens: list-address-readers: "and the deleted list’s address is still read, rotated and switched off by those who may add tasks to the list — the trash refuses tasks, not the address"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = '    if (!(await canCreateTaskIn(this.db, listId, actorId, { evenInTrash: true }))) {\n'
b = '    if (!(await canCreateTaskIn(this.db, listId, actorId))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-7-the-trash-locks-the-address: the trash locks the address')
