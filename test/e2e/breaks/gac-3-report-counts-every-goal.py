# THE GOALS REPORT COUNTS EVERY GOAL, as it did.
# Reddens: goal-access: "the goals report counts two goals for the member, three for the admin, and names no private one to the member"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = "            .where(and(eq(goals.workspaceId, workspaceId), reach === 'spaces' ? goalVisibilityFilter(this.db, actor.id) : undefined))\n"
b = '            .where(and(eq(goals.workspaceId, workspaceId)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("gac-3-report-counts-every-goal: applied")
