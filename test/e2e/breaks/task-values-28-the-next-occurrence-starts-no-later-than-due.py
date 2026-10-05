# THE NEXT OCCURRENCE OF A RECURRING TASK STARTS NO LATER THAN IT IS DUE: a start the rule puts after
# the due date is moved to the due date.
#
# Reddens: task-values: "the next occurrence of a monthly task moves each date by its rule: both on the 1st, the start at its own hour after the due at its own (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      startDate: shift(source.startDate),\n',
     '      startDate: (() => {\n        const start = shift(source.startDate)\n        const due = shift(source.dueDate)\n        return start && due && start > due ? due : start\n      })(),\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-28-the-next-occurrence-starts-no-later-than-due: the next occurrence's start is held at its due date")
