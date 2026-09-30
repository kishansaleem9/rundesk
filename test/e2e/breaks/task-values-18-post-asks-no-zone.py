# POST /TASKS ORDERS A DAY BESIDE A MOMENT AS IF NO ZONE WERE NAMED (`found-30-sep/a-task-starts-after-it-is-due`,
# found by a review of this work): `createTask` drops the writer's zone, so a task due the 4th with no
# time and starting at 09:00 on the 5th in Karachi is made, as every zone but the far east would see it.
#
# Reddens: task-values: "POST /tasks from a writer in Karachi refuses a task due on a day with no time and starting at 09:00 there the next day (400, saying so) and makes nothing; from Los Angeles, where that instant is the evening of the day it is due, it is made (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    assertDatesInOrder(data.startDate, data.dueDate, data.writerZone)\n',
     '    assertDatesInOrder(data.startDate, data.dueDate)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-18-post-asks-no-zone: createTask asks the dates in no zone')
