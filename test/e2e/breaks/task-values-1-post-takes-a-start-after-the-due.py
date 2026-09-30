# A TASK IS MADE STARTING AFTER IT IS DUE (`found-30-sep/a-task-starts-after-it-is-due`):
# `createTask` no longer asks the dates, so `POST /tasks` takes a start ten days out and a due
# date three days out, as it did before the rule (and so do a template's two typed dates and a
# duplicate, which reach the same method).
#
# Reddens: task-values: "POST /tasks refuses a task that starts after it is due (400, saying so) and makes nothing (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    assertDatesInOrder(data.startDate, data.dueDate, data.writerZone)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-1-post-takes-a-start-after-the-due: createTask asks nothing of the dates')
