# A TEMPLATE'S START GIVES WAY TO A TYPED DUE DATE.
#
# Reddens: unit: task-templates.service.test.ts "keeps the template’s start beside a typed due date before it, and its due date beside a typed start after it, and passes two typed dates on as typed"
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
print("tvs-5-the-template-start-gives-way-unit: a typed due date leaves the template's start out")
