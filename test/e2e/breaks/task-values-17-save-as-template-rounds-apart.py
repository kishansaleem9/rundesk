# SAVE AS TEMPLATE ROUNDS A TASK'S TWO DATES APART (`found-30-sep/a-task-starts-after-it-is-due`,
# found by a review of this work): each date is turned into whole days from now on its own, so a
# task due on a day with no time and starting at noon that day comes out starting a day after it is
# due, and the template rule refuses the save (400).
#
# Reddens: task-values: "Save as template takes a task due on a day with no time and starting at noon that day, whatever the hour it is saved, as a template starting no later than it is due (read by SQL); while a task that starts after it is due is refused as one, saying so, and none is saved"
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
print('task-values-17-save-as-template-rounds-apart: each date is rounded to days on its own')
