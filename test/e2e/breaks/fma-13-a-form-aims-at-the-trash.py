# A FORM IS MADE, OR CHANGED, TO AIM AT A LIST IN THE TRASH, as it was.
# Reddens: form-access: "and no form is made, or changed, to aim at a list in the trash — 409 saying so, none aimed there"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '    if (state?.inTrash) throw new ListInTrashException(mayRestoreList(list.role, state.deletedById, actorId))\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-13-a-form-aims-at-the-trash: a form aims at the trash')
