# THE TYPED DUE DATE GIVES WAY TO THE TEMPLATE'S START, not the other way round.
#
# Reddens: unit: task-templates.service.test.ts "leaves out the template’s start after a typed due date, and its due date before a typed start"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!typedStart) startDate = undefined\n',
     '    if (!typedStart) dueDate = undefined\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-14-the-typed-due-date-gives-way-unit: the typed due date is dropped for the template start')
