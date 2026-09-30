# A DUPLICATE DROPS A LATE START, SILENTLY (`found-30-sep/a-task-starts-after-it-is-due`): a task
# starting after it is due is copied without its start rather than refused with the reason.
#
# Reddens: task-values: "duplicating a task that starts after it is due is refused with the reason (400), and no copy is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      startDate: src?.startDate ?? undefined,\n',
     '      startDate: src?.startDate && src?.dueDate && src.startDate > src.dueDate ? undefined : src?.startDate ?? undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-10-a-duplicate-drops-the-late-start: a duplicate drops a start after the due date')
