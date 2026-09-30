# A TEMPLATE MAY START AFTER IT IS DUE (`found-30-sep/a-task-starts-after-it-is-due`): its payload
# is no longer asked the order of its two offsets, and every task made from it would start late.
#
# Reddens: task-values: "a template whose own start date is after its due date is refused when made (400, saying so), and none is saved (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (startDateOffsetDays !== null && dueDateOffsetDays !== null && startDateOffsetDays > dueDateOffsetDays) {\n',
     '    if (false) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-9-a-template-may-start-late: a template is not asked the order of its dates')
