# THE MAILER RUNNING EVERY REPORT AS NOBODY, as it did: the whole workspace, to any address.
# Reddens: unit: scheduled-reports.service.test.ts "runs each report as its owner, not as nobody"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/scheduled-reports.service.ts'
a = '    const result = await this.reports.runCustomReport(report.workspaceId, report.definition ?? {}, {\n      id: report.createdById,\n      role: report.ownerRole,\n    })\n'
b = '    const result = await this.reports.runCustomReport(report.workspaceId, report.definition ?? {})\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("rra-6-mailer-runs-as-nobody: applied")
