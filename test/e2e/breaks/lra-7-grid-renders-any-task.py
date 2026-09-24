# THE GRID RENDERS EVERY BLOCK'S TASK, as it did: a block made before the check shows another workspace's title.
# Reddens: lookup-read-access: "and a block already on such a task shows no title of it — while the open task’s block shows its own"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '      r.taskId && !readable.has(r.taskId)\n'
b = '      false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-7-grid-renders-any-task: applied")
