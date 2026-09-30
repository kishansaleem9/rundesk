# PATCH ASKS NOTHING OF THE DATES A TASK WOULD HOLD (`found-30-sep/a-task-starts-after-it-is-due`):
# a start moved past the due date, a due date moved before the start, or both the wrong way
# round, are written, as before the rule (the bulk editor and the sheet reach the same method).
#
# Reddens: task-values: "PATCH /tasks/:id refuses a start moved past the due date the task holds, a due date moved before its start, and both sent the wrong way round (400 each, saying so), and the task keeps its dates (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('startDate' in patch || 'dueDate' in patch) {\n      assertDatesInOrder(\n        'startDate' in patch ? patch.startDate : before.startDate,\n        'dueDate' in patch ? patch.dueDate : before.dueDate,\n        writerZone,\n      )\n    }\n",
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-3-patch-asks-nothing-of-the-dates: updateTask asks nothing of the dates')
