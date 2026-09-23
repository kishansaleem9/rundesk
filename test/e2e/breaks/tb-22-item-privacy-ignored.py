# THE SERVICE'S READ CHECK AS IT WAS: containers only. A private task in a list
# the reader can see is visible to them as far as every service path is concerned,
# though the task's own GET refuses them.
# Reddens: task-boundaries: "including a PRIVATE task in a list they can otherwise see — the rule the route’s guard applied and the service did not"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (ctx.listVisibility === 'private' || ctx.taskVisibility === 'private') {\n"
b = '    if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-22-item-privacy-ignored: applied")
