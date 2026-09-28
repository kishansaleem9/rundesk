# THE ANNOUNCEMENTS PANEL ASKS isAdmin ALONE: the member granted announcement.manage is refused the form and the list.
# Reddens: announcement-access: "workspace Settings offers an Announcements tab — Publish, and the list with the paused one — to the member granted announcement.manage and to a workspace admin who is no platform admin"
import io
p = '/home/user/rundesk/apps/web/src/components/announcements-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const mayManage = isAdmin || held === true\n'
b = '  const mayManage = isAdmin\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-8-panel-asks-admin: the panel asks isAdmin')
