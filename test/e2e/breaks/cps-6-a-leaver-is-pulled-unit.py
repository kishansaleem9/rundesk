# A DEPARTED MEMBER'S CALENDAR IS PULLED: the pull asks nothing of its connection's owner. (`found-6-oct/calendar-pull-uses-a-leavers-connection`)
# Reddens: unit: calendar-sync.service.test.ts "refuses the connection of somebody no longer in the workspace, or of nobody, saying whose it is, before the calendar is read; a member’s is read"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (!(await this.ownerIsMember(conn, workspaceId))) {\n      throw new BadRequestException(LEAVERS_CALENDAR[provider])\n    }\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cps-6-a-leaver-is-pulled-unit: the pull asks nothing of its connection's owner")
