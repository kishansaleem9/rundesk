# A CONNECTION TAKES EVERY TASK OF THE WORKSPACE WHILE ITS OWNER IS A MEMBER: the read rule is not asked, so a
# private space’s task goes into the calendar of a member refused it — and its Google Meet and Zoom are made there.
# Re-claimed 6 October: the meeting buttons ask the same rule.
# Reddens: calendar-push-reach: "a dated task in a private space goes only to the calendar of somebody who may open it: the admin’s Outlook is tried, the keeper’s Google Calendar — the keeper is refused the task — is not"
#   or "a task’s Google Meet is not made in the Google Calendar of a connection owner who may not open the task, nor once they have left: refused, 400, saying whose calendar it is — and on a task they may open while a member, the rule lets it through to the token"
#   or "nor its Zoom meeting in the Zoom of such an owner: refused, 400, saying whose Zoom it is — and let through to the token on a task they may open while a member"
#   or "and the task sheet’s Google Meet button says why, in the server’s words — not that the meeting could not be created"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    return (await readableTask(this.db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n'
b = '    void account\n    return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('cpr-1-the-read-rule-is-not-asked: a member’s connection takes every task')
