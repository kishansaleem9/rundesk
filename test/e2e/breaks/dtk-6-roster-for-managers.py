# THE ROSTER CSV IS OFFERED TO MANAGERS AGAIN: the manager is offered the people’s export.
# Reddens: data-transfer-keys: "Settings offers the member granted workspace.export the workspace’s data export — and offers the manager no export of the people"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-settings-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "          {perms.can('workspace.export') === true && ("
b = '          {isManagerOrAbove && ('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('dtk-6-roster-for-managers: the roster asks isManagerOrAbove')
