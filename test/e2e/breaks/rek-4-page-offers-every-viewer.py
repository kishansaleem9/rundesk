# THE REPORTS PAGE OFFERS ITS EXPORTS TO EVERY VIEWER, AS IT DID: Export CSV and Print / PDF for the guest who may only view.
# Reddens: report-export-key: "the reports page offers the guest who may only view neither Export CSV nor Print / PDF — and offers both to the guest who may export"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-reports-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayExport = usePermissions(workspaceId).can('report.export') === true\n"
b = "  const mayExport: boolean = usePermissions(workspaceId).can('report.export') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rek-4-page-offers-every-viewer: the page offers exports to everyone')
