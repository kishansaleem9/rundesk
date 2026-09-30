# THE REFUSAL GIVES NO REASON: "Invalid dates", not that a task cannot start after it is due.
#
# Reddens: unit: task-values.test.ts "refuses a task that would start after it is due with the reason (400), and passes one in order"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startsAfterDue(start, due, zone)) throw new BadRequestException(START_AFTER_DUE)\n',
     "  if (startsAfterDue(start, due, zone)) throw new BadRequestException('Invalid dates')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-3-the-refusal-gives-no-reason-unit: the refusal says nothing of the dates')
