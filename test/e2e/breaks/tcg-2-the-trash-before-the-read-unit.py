# THE TRASH IS ASKED BEFORE THE READ RULE: somebody refused the list is told it is in the trash.
# Reddens: unit: task-create.test.ts "tells somebody who may not open it nothing of the trash: the list is not found, as before"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = "  if (!home) throw new NotFoundException('List not found')\n"
b = "  if (!home) throw new NotFoundException('List not found')\n  if (home.inTrash) throw new ListInTrashException()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-2-the-trash-before-the-read-unit: the trash is asked before the read rule')
