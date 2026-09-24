# THE CALENDAR FEED WITH ONLY THE PRIVATE-ITEM RULE, as it was: a private space's dated tasks, title and description.
# Reddens: workspace-read-access: "a member’s calendar feed carries no task of a space they are refused, nor a private task — while it carries the open space’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync.service.ts'
a = '    const visFilter = and(containerVisibilityFilter(this.db, userId, isManager), taskVisibilityFilter(this.db, userId, isManager))\n'
b = '    const visFilter = taskVisibilityFilter(this.db, userId, isManager)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-26-feed-skips-containers: applied")
