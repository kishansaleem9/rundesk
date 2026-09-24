# EXPORT CSV SAVES THE FIRST WORKSPACE'S TRAIL while the page shows the picked one's.
# Reddens: admin-audit-page: "Export CSV saves the picked workspace’s trail, not the first’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/admin-audit-page.tsx'
a = "      `/workspaces/${workspaceId}/audit-logs/export${qs ? `?${qs}` : ''}`,\n"
b = "      `/workspaces/${workspaces.data?.[0]?.workspace.id}/audit-logs/export${qs ? `?${qs}` : ''}`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("aap-3-the-export-reads-the-first-workspace: applied")
