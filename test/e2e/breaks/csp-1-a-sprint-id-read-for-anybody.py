# THE CONTRIBUTION REPORT RESOLVES A SPRINT ID WITH NO READ RULE AGAIN: a private space's sprint names the period.
# Reddens: contribution-sprint: "a member asking for a private space’s sprint is not given its name as the period — the admin is"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = '            .where(and(eq(sprints.id, sprintId), eq(sprints.workspaceId, workspaceId), readable))\n'
b = '            .where(and(eq(sprints.id, sprintId), eq(sprints.workspaceId, workspaceId)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("csp-1-a-sprint-id-read-for-anybody: applied")
