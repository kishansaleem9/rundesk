# Check 14 — delete-forever refuses a task that was never deleted. Remove the
# guard and the endpoint hard-deletes a live task, which is what it did before.
#
# Reddens: task-delete: "and it refuses a task that was never deleted (404), leaving the row alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!row.trashed) throw new NotFoundException(`This ${type} is not in the trash`)\n"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(a, ''))
print('BROKE check 14: the trash endpoints act on items that are not in the trash')
