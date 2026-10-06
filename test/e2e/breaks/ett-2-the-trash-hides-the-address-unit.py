# A DELETED LIST’S ADDRESS IS REFUSED TO EVERYBODY, as after the trash refusal reached it as a plain no.
# Reddens: unit: email-to-task.service.test.ts "still reads a deleted list’s address to somebody who may add tasks to it but for the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = '    if (!(await canCreateTaskIn(this.db, listId, readerId, { evenInTrash: true }))) {\n'
b = '    if (!(await canCreateTaskIn(this.db, listId, readerId))) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ett-2-the-trash-hides-the-address-unit: the trash hides the address')
