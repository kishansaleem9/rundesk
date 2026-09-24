# THE SPRINT REPORT LISTS EVERY SPRINT AGAIN, by name, whatever space it is in.
# Reddens: sprint-access: "the sprint report names no sprint of a space the member is refused — it has the open one, and the admin’s has the private one"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = "      .where(and(eq(sprints.workspaceId, workspaceId), reach === 'spaces' && actor ? sprintVisibilityFilter(this.db, actor.id) : undefined))\n      .orderBy(desc(sprints.startDate))\n      .limit(10)\n"
b = "      .where(and(eq(sprints.workspaceId, workspaceId), reach === 'spaces' && actor ? undefined : undefined))\n      .orderBy(desc(sprints.startDate))\n      .limit(10)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-4-the-report-reads-every-sprint: applied")
