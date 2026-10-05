# THE BULK EDITOR REFUSES TWO DATES THE WRONG WAY ROUND, handing no task anything.
#
# Reddens: unit: task-writes.test.ts "hands two dates the wrong way round, and an estimate below nought, to each task, changing every one"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      throw new BadRequestException('patch is required')\n    }\n",
     "      throw new BadRequestException('patch is required')\n    }\n    if (patch.startDate && patch.dueDate && new Date(patch.startDate).getTime() > new Date(patch.dueDate).getTime()) {\n      throw new BadRequestException('A task cannot start after it is due')\n    }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tvs-3-bulk-refuses-two-dates-the-wrong-way-round-unit: the bulk editor refuses two dates the wrong way round')
