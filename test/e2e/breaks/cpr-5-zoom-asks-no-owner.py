# A TASK’S ZOOM MEETING IS MADE IN THE CONNECTED ZOOM WHOEVER IT BELONGS TO, as it was.
# Reddens: calendar-push-reach: "nor its Zoom meeting in the Zoom of such an owner: refused, 400, saying whose Zoom it is — and let through to the token on a task they may open while a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n'
b = "    if ((provider as string) !== 'zoom' && !(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-5-zoom-asks-no-owner: a Zoom meeting asks nothing of the connection’s owner')
