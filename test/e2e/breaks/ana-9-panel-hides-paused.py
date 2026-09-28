# THE ANNOUNCEMENTS PANEL LISTS LIVE ONES ALONE: the paused announcement is missing from the list.
# Reddens: announcement-access: "workspace Settings offers an Announcements tab — Publish, and the list with the paused one — to the member granted announcement.manage and to a workspace admin who is no platform admin"
import io
p = '/home/user/rundesk/apps/web/src/components/announcements-panel.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const items = announcementsQuery.data ?? []\n'
b = '  const items = (announcementsQuery.data ?? []).filter((item) => item.isActive)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-9-panel-hides-paused: the panel drops paused rows')
