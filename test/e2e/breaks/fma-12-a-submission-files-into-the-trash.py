# A FORM’S SUBMISSION FILES ITS TASK INTO A LIST IN THE TRASH, as it did: past `createTask` and its gate, where
# nobody can find it.
# Reddens: form-access: "a public submission to a form whose list is in the trash files no task there — the submission is kept, with its routing error saying the list is in the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '    if (targetList.inTrash) throw new ListInTrashException()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-12-a-submission-files-into-the-trash: a submission files into the trash')
