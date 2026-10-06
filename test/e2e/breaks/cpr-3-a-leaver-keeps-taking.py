# A CONNECTION WHOSE OWNER HAS LEFT THE WORKSPACE GOES ON TAKING ITS TASKS, and its meetings, as it did.
# Re-claimed 6 October: the meeting buttons ask the same rule, and a platform admin who has left is checked.
# Reddens: calendar-push-reach: "once the keeper has left the workspace their calendar takes nothing from it — the open task goes to the admin’s Outlook alone — and their connection is kept, not deleted, for an admin to see and remove"
#   or "a task’s Google Meet is not made in the Google Calendar of a connection owner who may not open the task, nor once they have left: refused, 400, saying whose calendar it is — and on a task they may open while a member, the rule lets it through to the token"
#   or "nor its Zoom meeting in the Zoom of such an owner: refused, 400, saying whose Zoom it is — and let through to the token on a task they may open while a member"
#   or "a platform admin’s calendar takes a workspace’s task while they are a member of it, and nothing once they have been removed — the read rule would let them in wherever they are, so the membership is asked of them too — and their connection is kept"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    if (!member) return false\n'
b = '    if (!member) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-3-a-leaver-keeps-taking: a removed owner’s connection takes every task')
