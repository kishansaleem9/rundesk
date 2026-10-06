# THE MEMBERS’ EXPORT CSV SAVES UNDER A NAME THE PAGE WORKS OUT again, not the server’s.
# Reddens: file-exports: "Settings’ Export JSON, Export tasks CSV and the members’ Export CSV, and the report builder’s Export PDF, each save the file under the name the server gives it — the report under its own name"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
a = '              downloadFile(`/workspaces/${workspaceId}/export/csv/members`).catch((e) =>\n'
b = '              downloadFile(`/workspaces/${workspaceId}/export/csv/members`, `rundesk-${workspaceId}-members.csv`).catch((e) =>\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fex-13-settings-names-the-members-csv-itself: workspace-settings-page.tsx: the members’ Export CSV saves under a name the page works out.')
