# `createTask` ASKS NOTHING OF THE ESTIMATE, and writes one below nought.
#
# Reddens: unit: task-writes.test.ts "refuses a task that starts after it is due, or an estimate below nought, and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    assertEstimate(data.timeEstimate)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-7-create-asks-no-estimate-unit: createTask takes any estimate')
