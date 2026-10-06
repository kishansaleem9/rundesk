# A FORM IS AIMED AT A LIST IN THE TRASH, as it could be.
# Reddens: unit: forms-trash.test.ts "refuses a form aimed at a list in the trash, telling a member who did not delete it to ask for it to be restored"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '    if (state?.inTrash) throw new ListInTrashException(mayRestoreList(list.role, state.deletedById, actorId))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fmt-3-a-form-aims-at-the-trash-unit: a form aims at the trash')
