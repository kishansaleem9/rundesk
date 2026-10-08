# A date cleared keeps the time flag sent with it
# (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`): a task with no due
# date says its due date carries a time.
#
# Reddens: unit: task-date-input.test.ts "has no time for no date, whatever is sent; leaves a date the write does not set alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-date-input.ts'
a = "    if (date === null) return false\n"
b = "    if (date === null) return sent ?? false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('htf-5-no-date-keeps-a-sent-time-flag-unit: no date keeps a sent flag')
