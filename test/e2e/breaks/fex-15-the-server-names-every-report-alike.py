# THE SERVER NAMES EVERY CUSTOM REPORT’S PDF ALIKE again, whatever the report is called.
# Reddens: file-exports: "Settings’ Export JSON, Export tasks CSV and the members’ Export CSV, and the report builder’s Export PDF, each save the file under the name the server gives it — the report under its own name"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/reports.controller.ts'
a = "      disposition: downloadName(body?.name, '.pdf', 'rundesk-report').disposition,\n"
b = '      disposition: \'attachment; filename="rundesk-report.pdf"\',\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fex-15-the-server-names-every-report-alike: reports.controller.ts: every custom report’s PDF is called rundesk-report.pdf.')
