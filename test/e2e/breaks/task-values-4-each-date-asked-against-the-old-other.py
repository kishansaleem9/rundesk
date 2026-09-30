# EACH DATE SENT IS ASKED AGAINST THE OTHER AS IT WAS (`found-30-sep/a-task-starts-after-it-is-due`),
# not as it will be: both dates moved at once, past the old ones but in order, are refused.
#
# Reddens: task-values: "and PATCH takes both dates moved at once past the old ones, in order, and a due date cleared (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if ('startDate' in patch || 'dueDate' in patch) {\n      assertDatesInOrder(\n        'startDate' in patch ? patch.startDate : before.startDate,\n        'dueDate' in patch ? patch.dueDate : before.dueDate,\n        writerZone,\n      )\n    }\n",
     "    if ('startDate' in patch) assertDatesInOrder(patch.startDate, before.dueDate, writerZone)\n    if ('dueDate' in patch) assertDatesInOrder(before.startDate, patch.dueDate, writerZone)\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-4-each-date-asked-against-the-old-other: each date is asked against the stored other')
