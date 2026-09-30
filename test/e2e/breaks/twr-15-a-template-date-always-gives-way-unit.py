# A TEMPLATE DATE BESIDE A TYPED ONE ALWAYS GIVES WAY, in order or not.
#
# Reddens: unit: task-templates.service.test.ts "keeps the template’s date where it fits beside the typed one, and passes two typed dates on as typed"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startsAfterDue(startDate, dueDate, zone)) {\n',
     '  if (startDate && dueDate) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-15-a-template-date-always-gives-way-unit: a template date is dropped whenever there are two')
