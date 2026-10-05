# THE CREATE MODAL HOLDS CREATE WHILE THE START TYPED IS AFTER THE DUE DATE.
#
# Reddens: task-values: "the create modal makes a task whose start is typed after its due date: nothing is said beside the dates, Create is offered, and the task holds both (read by SQL)"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  const canCreate = Boolean(title.trim() && listId) && !create.isPending && !instant.isPending\n',
     '  const canCreate = Boolean(title.trim() && listId) && !create.isPending && !instant.isPending && !(startDate && dueDate && startDate > dueDate)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-34-the-modal-holds-create: Create waits for the dates to be in order')
