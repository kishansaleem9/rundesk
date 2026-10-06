# A FORM'S SUBMISSION FILES INTO A LIST WHOSE PROJECT IS IN THE TRASH. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: unit: forms-trash.test.ts "nor for a submission whose list’s project is in the trash, naming it (found-6-oct/task-fallback-files-into-a-deleted-project)"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (held) throw new ListInTrashException(true, held.where)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fmt-4-a-submission-files-into-a-held-list-unit: a submission asks nothing of what holds its list')
