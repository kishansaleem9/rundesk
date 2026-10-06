# A TASK’S GOOGLE MEET IS MADE IN THE CONNECTED CALENDAR WHOEVER IT BELONGS TO, as it was: the title of a private
# space’s task goes into the calendar of a member refused it, and of one who has left.
# Reddens: calendar-push-reach: "a task’s Google Meet is not made in the Google Calendar of a connection owner who may not open the task, nor once they have left: refused, 400, saying whose calendar it is — and on a task they may open while a member, the rule lets it through to the token"
#   or "and the task sheet’s Google Meet button says why, in the server’s words — not that the meeting could not be created"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (!(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n'
b = "    if (provider !== 'google_meet' && !(await this.calendarSync.ownerMayRead(found, { id: taskId, workspaceId: ctx.workspaceId }))) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-4-the-meet-asks-no-owner: a Google Meet asks nothing of the connection’s owner')
