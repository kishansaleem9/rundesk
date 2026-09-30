# A TEMPLATE STARTING THE DAY IT IS DUE IS REFUSED TOO.
#
# Reddens: unit: task-templates.service.test.ts "refuses to make or change a template whose start date is after its due date, and saves nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('startDateOffsetDays > dueDateOffsetDays) {\n',
     'startDateOffsetDays >= dueDateOffsetDays) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-16-a-template-may-not-start-the-day-it-is-due-unit: the same day is refused')
