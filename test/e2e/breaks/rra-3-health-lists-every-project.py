# PROJECT HEALTH LISTING EVERY PROJECT, as it did: a refused space's project by name.
# Reddens: report-read-access: "project health lists, and the activity feed names, nothing of a space the member is refused — while the open project is listed; the admin’s have both"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = '      .where(and(eq(spaces.workspaceId, workspaceId), eq(projects.isArchived, false), projectsInReach))\n'
b = '      .where(and(eq(spaces.workspaceId, workspaceId), eq(projects.isArchived, false)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-3-health-lists-every-project: applied")
