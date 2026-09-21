# The @ picker greys out every candidate, so the "cannot open this" warning
# fires for the whole workspace. Nothing errors and the warning is still
# technically present — it has simply stopped carrying information, which
# teaches everyone to click past it and loses the one case it was built for.
#
# Reddens: comment-recording: "on an ordinary task, nobody is flagged"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      hasAccess: canReachTask(ctx, { userId: m.userId, workspaceRole: m.role }),\n'
b = '      hasAccess: false,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: every mention candidate is flagged as unable to open the task.')
