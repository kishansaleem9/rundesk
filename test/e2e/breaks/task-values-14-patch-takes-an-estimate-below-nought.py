# `PATCH /tasks/:id` TAKES AN ESTIMATE BELOW NOUGHT (`found-30-sep/task-estimate-below-zero`):
# `updateTask` asks nothing of it, as before.
#
# Reddens: task-values: "PATCH /tasks/:id refuses an estimate below nought (400), and the task keeps its estimate (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    // `found-30-sep/task-estimate-below-zero` — none, or whole seconds from nought.\n    if ('timeEstimate' in patch) assertEstimate(patch.timeEstimate)\n",
     '    // `found-30-sep/task-estimate-below-zero` — none, or whole seconds from nought.\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('task-values-14-patch-takes-an-estimate-below-nought: updateTask asks nothing of the estimate')
