# A FORM’S SUBMISSION FILES ITS TASK INTO A LIST IN THE TRASH, as it did.
# Reddens: unit: forms-trash.test.ts "makes no task for a submission whose list is in the trash: the refusal is the routing error the submission keeps"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '    if (targetList.inTrash) throw new ListInTrashException()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fmt-1-a-submission-files-into-the-trash-unit: a submission files into the trash')
