# THE REPORT BUILDER’S EXPORT PDF SAVES UNDER A NAME OF ITS OWN again, not the server’s.
# Reddens: file-exports: "Settings’ Export JSON, Export tasks CSV and the members’ Export CSV, and the report builder’s Export PDF, each save the file under the name the server gives it — the report under its own name"
import io
p = '/home/user/rundesk/apps/web/src/components/report-builder.tsx'
a = '      await downloadFilePost(`/workspaces/${workspaceId}/reports/custom/export.pdf`, { ...definition, name })\n'
b = "      await downloadFilePost(`/workspaces/${workspaceId}/reports/custom/export.pdf`, { ...definition, name }, `${(name || 'report').replace(/[^a-z0-9-_]+/gi, '-')}.pdf`)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fex-14-the-report-builder-names-its-pdf-itself: report-builder.tsx: Export PDF saves under a name the builder works out.')
