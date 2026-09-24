# EVERY REPORT WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's tasks counted and named.
# Reddens: report-read-access: "a member’s overview and completion count only the task they may open — the admin’s count all four"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = '    return and(taskInReachFilter(this.db, workspaceId, actor.id, isManager), taskVisibilityFilter(this.db, actor.id, isManager))\n'
b = '    return taskVisibilityFilter(this.db, actor.id, isManager)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-1-reports-skip-containers: applied")
