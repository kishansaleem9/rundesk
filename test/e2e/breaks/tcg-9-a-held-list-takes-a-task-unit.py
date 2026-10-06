# A LIST WHOSE PROJECT IS IN THE TRASH TAKES A TASK. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: unit: task-create.test.ts "refuses a task in a list whose project, folder or space is in the trash, 409, naming it and what to do — and tells a member who did not delete it to ask"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (held && !opts.evenInTrash) throw new ListInTrashException(mayRestoreList(list.role, held.deletedById, actorId), held.where)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tcg-9-a-held-list-takes-a-task-unit: the create gate asks nothing of what holds the list')
