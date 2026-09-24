# A REPORT WHOSE OWNER HAS LEFT THE WORKSPACE STILL SENT: only a deleted owner stops it.
# Reddens: unit: scheduled-reports.service.test.ts "sends nothing for a report whose owner has left the workspace, or was deleted, and stamps it"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/scheduled-reports.service.ts'
a = '    if (!report.createdById || !(await this.ownerStillMember(report.workspaceId, report.createdById))) {\n'
b = '    if (!report.createdById) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-7-mailer-sends-for-the-departed: applied")
