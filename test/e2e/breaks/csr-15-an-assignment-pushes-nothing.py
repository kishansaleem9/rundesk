# A TASK ASSIGNED TO SOMEBODY IS NOT PUSHED.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a sync of only the tasks assigned to its owner takes a task once they are assigned it, and gives it up when they are not"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    // A sync of only the tasks assigned to its owner takes it now.\n    this.fireCalendarPush(taskId)\n',
     '    // BROKEN: an assignment pushes nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-15-an-assignment-pushes-nothing: an assignment pushes nothing')
