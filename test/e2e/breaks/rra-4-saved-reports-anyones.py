# ANYBODY'S SAVED REPORT EDITED, SENT AND DELETED BY ANY MEMBER, as it was.
# Reddens: report-read-access: "a member cannot edit, send or delete another person’s saved report (404 each, the report unchanged, its recipients untouched)"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts'
a = "    if (row.createdById === actor.id) return\n    if (await resolveIsManager(this.db, workspaceId, actor.id, actor.role)) return\n    throw new NotFoundException('Report not found')\n"
b = '    return\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-4-saved-reports-anyones: applied")
