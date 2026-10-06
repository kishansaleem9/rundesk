# A GOOGLE MEET ASKS NOTHING OF ITS CONNECTION’S OWNER, as it did.
# Reddens: unit: external-links.test.ts "refuses a google_meet meeting in the account of a connection owner who may not open the task: 400 saying so, nothing sent, nothing linked"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n'
b = "    if (provider !== 'google_meet' && !(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('els-1-the-meet-asks-no-owner-unit: a Google Meet asks nothing of the connection’s owner')
