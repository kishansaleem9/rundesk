# UPDATETASK REFUSES AN ESTIMATE BELOW NOUGHT.
#
# Reddens: unit: task-writes.test.ts "writes a start moved past the due date it holds, a due date moved before its start, both the wrong way round, and an estimate below nought"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    patch = pickUpdatable(patch)\n',
     "    patch = pickUpdatable(patch)\n    if (typeof patch.timeEstimate === 'number' && patch.timeEstimate < 0) throw new BadRequestException('timeEstimate must not be below 0')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tvs-2-update-refuses-an-estimate-below-nought-unit: updateTask refuses an estimate below nought')
