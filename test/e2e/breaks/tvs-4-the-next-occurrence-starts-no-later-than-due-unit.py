# THE NEXT OCCURRENCE STARTS NO LATER THAN IT IS DUE: a start the rule puts after the due date is
# moved to it.
#
# Reddens: unit: task-writes.test.ts "moves the start and the due date each by the rule, a start after the due among them, and carries the estimate as it is"
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
print("tvs-4-the-next-occurrence-starts-no-later-than-due-unit: the next occurrence's start is held at its due date")
