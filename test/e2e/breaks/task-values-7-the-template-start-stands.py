# THE TEMPLATE'S START STANDS BESIDE A TYPED DUE DATE (`found-30-sep/a-task-starts-after-it-is-due`):
# the merge no longer lets the date typed win, so the task is refused for starting after it is
# due rather than made due when typed.
#
# Reddens: task-values: "a task made from a template starting nine days out, with a due date typed three days out, is due when typed and has no start: the template’s start date gives way to it (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startsAfterDue(startDate, dueDate, zone)) {\n',
     '  if (false && startsAfterDue(startDate, dueDate, zone)) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-7-the-template-start-stands: the template date contradicting a typed one is kept')
