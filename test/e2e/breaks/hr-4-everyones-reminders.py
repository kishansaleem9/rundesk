# THE LIST WITHOUT ITS OWNER: everybody's reminders in the workspace.
# Reddens: home-reminders: "and another member’s reminder in the same workspace is not in it"
import io
p = '/home/user/rundesk/apps/api/src/modules/reminders/task-reminders.service.ts'
a = '      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.userId, userId), isNull(reminders.notifiedAt)))\n'
b = '      .where(and(eq(reminders.workspaceId, workspaceId), isNull(reminders.notifiedAt)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-4-everyones-reminders: applied")
