# EVERY FORM’S LIST IS READ AS IN THE TRASH: no submission makes a task.
# Reddens: unit: forms-trash.test.ts "and makes it once the list is not in the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '    if (targetList.inTrash) throw new ListInTrashException()\n'
b = '    if (targetList.inTrash || targetList.id) throw new ListInTrashException()\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fmt-2-every-list-in-the-trash-unit: every list is in the trash')
