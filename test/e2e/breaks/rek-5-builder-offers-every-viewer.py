# THE REPORT BUILDER OFFERS ITS EXPORTS TO EVERY VIEWER, AS IT DID: Export PDF and Export CSV for the guest who may only view.
# Reddens: report-export-key: "the report builder offers the guest who may only view no Export PDF or Export CSV — and offers both to the guest who may export"
import io
p = '/home/user/rundesk/apps/web/src/components/report-builder.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayExport = usePermissions(workspaceId).can('report.export') === true\n"
b = "  const mayExport: boolean = usePermissions(workspaceId).can('report.export') === true || true\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rek-5-builder-offers-every-viewer: the builder offers exports to everyone')
