# THE LIST WITHOUT ITS "STILL WAITING" FILTER: reminders that went off stay.
# Reddens: home-reminders: "nor one that has already gone off"
import io
p = '/home/user/rundesk/apps/api/src/modules/reminders/task-reminders.service.ts'
a = '      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.userId, userId), isNull(reminders.notifiedAt)))\n'
b = '      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.userId, userId)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hr-3-fired-reminders-listed: applied")
