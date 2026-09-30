# PATCH /TASKS/:ID ORDERS A DAY BESIDE A MOMENT AS IF NO ZONE WERE NAMED (`found-30-sep/a-task-starts-after-it-is-due`,
# found by a review of this work): `updateTask` drops the writer's zone, so a start at 09:00 on the 5th
# in Karachi is set beside a due day of the 4th, and a due day of the 4th dropped from the calendar
# beside it, from the sheet, a list row, the calendar and the bulk editor alike (so the sheet in
# Karachi, which writes through it, is taken too).
#
# Reddens: task-values: "PATCH /tasks/:id from Karachi refuses a start at 09:00 on the day after the due day the task holds, and a due day with no time, as the calendar drop sends one, before the start it holds (400 each, saying so), and the bulk editor fails that task with the reason, each task keeping its dates; while from Los Angeles both are taken (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        'dueDate' in patch ? patch.dueDate : before.dueDate,\n        writerZone,\n      )\n",
     "        'dueDate' in patch ? patch.dueDate : before.dueDate,\n      )\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-19-patch-asks-no-zone: updateTask asks the dates in no zone')
