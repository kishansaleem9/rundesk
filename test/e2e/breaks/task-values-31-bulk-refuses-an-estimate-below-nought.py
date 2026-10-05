# THE BULK EDITOR REFUSES AN ESTIMATE BELOW NOUGHT, changing no task.
#
# Reddens: task-values: "the bulk editor sets an estimate below nought on every task it is given (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      throw new BadRequestException('patch is required')\n    }\n",
     "      throw new BadRequestException('patch is required')\n    }\n    if (typeof patch.timeEstimate === 'number' && patch.timeEstimate < 0) throw new BadRequestException('timeEstimate must not be below 0')\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-31-bulk-refuses-an-estimate-below-nought: the bulk editor refuses an estimate below nought')
