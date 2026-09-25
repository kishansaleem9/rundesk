# THE DATA EXPORT CARD IS AN ADMIN’S AGAIN: the member granted workspace.export is not offered it.
# Reddens: data-transfer-keys: "Settings offers the member granted workspace.export the workspace’s data export — and offers the manager no export of the people"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '      {permissions.can(\'workspace.export\') === true && (\n        <Card className="p-4" data-testid="settings-card-export">'
b = '      {isAdmin && (\n        <Card className="p-4" data-testid="settings-card-export">'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-5-export-card-admins-only: the export card asks isAdmin')
