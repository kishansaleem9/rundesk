# SEND-NOW WITH NO OWNER CHECK, as it was: any member mails anybody's report to its recipients.
# Reddens: report-read-access: "a member cannot edit, send or delete another person’s saved report (404 each, the report unchanged, its recipients untouched)"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
a = '    await this.reports.assertSavedReportOwner(workspaceId, reportId, user)\n    return this.scheduledReports.sendReportNow(workspaceId, reportId)\n'
b = '    return this.scheduledReports.sendReportNow(workspaceId, reportId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-5-send-skips-the-owner-check: applied")
