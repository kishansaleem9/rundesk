# A PERSON'S OWN CALENDAR FEED ASKS THE SPACE AND THE PROJECT ONLY: a private list's task assigned to them is served.
# Reddens: private-list-reach: "), 'the member’s own feed carries none of the private list’s tasks, even one assigned to them — and carries their own',"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "import { taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
b = "import { containerVisibilityFilter, taskInReachFilter } from '../../common/permissions/container-access.guard-helper'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = '    const visFilter = and(taskInReachFilter(this.db, workspaceId, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n'
b = '    void taskInReachFilter\n    const visFilter = and(containerVisibilityFilter(this.db, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-14-the-feed-stops-at-the-project: applied")
