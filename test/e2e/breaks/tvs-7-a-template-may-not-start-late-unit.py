# A TEMPLATE WHOSE START IS AFTER ITS DUE DATE IS REFUSED.
#
# Reddens: unit: task-templates.service.test.ts "makes and changes a template whose start date is after its due date, keeping both offsets"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const priority = clampPriority(raw.priority)\n',
     "    const priority = clampPriority(raw.priority)\n    if (typeof raw.startDateOffsetDays === 'number' && typeof raw.dueDateOffsetDays === 'number' && raw.startDateOffsetDays > raw.dueDateOffsetDays) {\n      throw new BadRequestException('A template cannot start after it is due')\n    }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tvs-7-a-template-may-not-start-late-unit: a template starting after it is due is refused')
