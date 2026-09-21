# The other direction, and the worse one: the picker says everybody can open
# the task. On a private task you @-mention somebody, the picker raises no
# warning, they are notified, and the task will not open for them. The facade —
# a control that answers without consulting anything.
#
# Reddens: comment-recording:
#   "making the task private flags the person who now cannot open it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      hasAccess: canReachTask(ctx, { userId: m.userId, workspaceRole: m.role }),\n'
b = '      hasAccess: true,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the mention picker says everybody can open the task.')
