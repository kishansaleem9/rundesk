# A TEMPLATE'S DATE BESIDE A TYPED ONE IS KEPT OR LEFT OUT IN NO ZONE, where `createTask` then asks
# the writer's: a template start it keeps is refused there.
#
# Reddens: unit: task-templates.service.test.ts "asks where the person is whether a template’s start fits beside a typed due day with no time"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (startsAfterDue(startDate, dueDate, zone)) {\n',
     '  if (startsAfterDue(startDate, dueDate)) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-26-the-template-merge-asks-no-zone-unit: templateWithForm asks no zone')
