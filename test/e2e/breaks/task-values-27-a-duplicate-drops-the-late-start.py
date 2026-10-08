# A DUPLICATE OF A TASK THAT STARTS AFTER IT IS DUE IS MADE WITHOUT ITS START.
#
# Re-aimed 8 October (batch 19): a copy takes its dates when Dates is ticked (`duplicate-copies-no-attachments`)
# Reddens: task-values: "duplicating a task that starts after it is due makes a copy holding both dates (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      startDate: take.dates ? src?.startDate ?? undefined : undefined,\n',
     '      startDate: take.dates ? (src?.startDate && src?.dueDate && src.startDate > src.dueDate ? undefined : src?.startDate ?? undefined) : undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-27-a-duplicate-drops-the-late-start: the copy drops a start after the due date')
