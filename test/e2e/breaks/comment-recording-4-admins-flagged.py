# Everybody is evaluated as an ordinary member, so workspace admins — who can
# open anything — are flagged as unable to. The warning then appears beside the
# people most often mentioned, which is the fastest way to train a team to
# ignore it.
#
# Reddens: comment-recording: "and does not flag the admins, who can open anything"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      hasAccess: canReachTask(ctx, { userId: m.userId, workspaceRole: m.role }),\n'
b = "      hasAccess: canReachTask(ctx, { userId: m.userId, workspaceRole: 'member' }),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: admins are evaluated as ordinary members and flagged.')
