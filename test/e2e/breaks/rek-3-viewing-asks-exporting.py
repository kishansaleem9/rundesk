# EVERY REPORT ROUTE ASKS report.export TOO: the guest who may only view runs no report and reads no overview.
# Reddens: report-export-key: "the guest who may only view still runs the report and reads the overview — viewing asks report.view.basic alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "@RequirePermissions('report.view.basic')\n@FeatureFlag(FLAGS.REPORTING)\n"
b = "@RequirePermissions('report.view.basic', 'report.export')\n@FeatureFlag(FLAGS.REPORTING)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rek-3-viewing-asks-exporting: viewing asks report.export')
