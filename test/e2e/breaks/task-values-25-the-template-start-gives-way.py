# A TEMPLATE'S START GIVES WAY TO A TYPED DUE DATE: the task made beside a typed due date has no start.
#
# Reddens: task-values: "a task made from a template starting nine days out, with a due date typed three days out, is due when typed and starts when the template says; with both typed the wrong way round, it holds both as typed (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    startDate: form.startDate ? new Date(form.startDate) : offsetToDate(now, payload.startDateOffsetDays) ?? undefined,\n',
     '    startDate: form.startDate ? new Date(form.startDate) : form.dueDate ? undefined : offsetToDate(now, payload.startDateOffsetDays) ?? undefined,\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("task-values-25-the-template-start-gives-way: a typed due date leaves the template's start out")
