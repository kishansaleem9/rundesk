# THE READ RULE IS ASKED OF AN ACCOUNT THAT IS NOBODY: only a platform admin’s connection, which the rule lets through
# by its role alone, takes a task — a member’s takes nothing, even a task they may open, and a meeting is refused in it.
# Re-claimed 6 October: the meeting buttons ask the same rule.
# Reddens: calendar-push-reach: "a dated task both may open goes to both calendars: the keeper’s Google Calendar and the admin’s Outlook are each tried"
#   or "a task’s Google Meet is not made in the Google Calendar of a connection owner who may not open the task, nor once they have left: refused, 400, saying whose calendar it is — and on a task they may open while a member, the rule lets it through to the token"
#   or "nor its Zoom meeting in the Zoom of such an owner: refused, 400, saying whose Zoom it is — and let through to the token on a task they may open while a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n'
b = "    return (await readableTask(this.db, task.workspaceId, task.id, { id: '00000000-0000-4000-8000-000000000000', role: account?.role })) !== null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-2-only-a-platform-admin-reads: only a platform admin’s connection takes a task')
