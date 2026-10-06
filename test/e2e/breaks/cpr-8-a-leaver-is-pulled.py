# A DEPARTED MEMBER'S CALENDAR IS PULLED: the pull asks nothing of its connection's owner. (`found-6-oct/calendar-pull-uses-a-leavers-connection`)
# Reddens: calendar-push-reach: "a calendar is pulled only while its owner is in the workspace: the keeper’s Google Calendar, chosen while they were a member (it stops at its missing token), is refused once they have left — 400, saying whose it is — and nothing is made from it"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!(await this.ownerIsMember(conn, workspaceId))) {\n      throw new BadRequestException(LEAVERS_CALENDAR[provider])\n    }\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cpr-8-a-leaver-is-pulled: the pull asks nothing of its connection's owner")
