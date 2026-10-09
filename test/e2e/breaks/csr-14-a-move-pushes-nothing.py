# A TASK MOVED TO ANOTHER LIST IS NOT PUSHED.
# (`ledger-rows/row-1962`)
# Reddens: calendar-sync-rules: "a task in a place no sync holds is not written; moved out of the folder its event comes off, and moved back it is written again"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    // Its list decides which syncs hold it: off the calendars of the place it left, onto those of the one it joined.\n    this.fireCalendarPush(taskId)\n',
     '    // BROKEN: a move pushes nothing\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('csr-14-a-move-pushes-nothing: a move pushes nothing')
