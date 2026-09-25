# THE CSV EXPORT ASKS ONLY WHAT VIEWING ASKS, AS IT DID: a guest granted viewing downloads the report.
# Reddens: report-export-key: "a guest granted report.view.basic alone downloads no CSV (403) — a guest granted report.export too does, and so does a member"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @Post('custom/export')\n  // Viewing and exporting, as `contribution.pdf`.\n  @RequirePermissions('report.view.basic', 'report.export')\n"
b = "  @Post('custom/export')\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rek-1-csv-asks-viewing-alone: the CSV export asks the class key alone')
