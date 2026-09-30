# A TASK'S TWO DATES ARE ROUNDED TO A TEMPLATE'S DAYS EACH ON ITS OWN, so two in order can come out
# the wrong way round.
#
# Reddens: unit: task-templates.service.test.ts "keeps a start no later than the due where the task’s own dates are in order, and leaves a task that starts after it is due as it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startDateOffsetDays !== null && dueDateOffsetDays !== null && startDateOffsetDays > dueDateOffsetDays && !startsAfterDue(start, due)) {\n',
     '  if (false) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-25-offsets-rounded-apart-unit: each date is rounded to days on its own')
