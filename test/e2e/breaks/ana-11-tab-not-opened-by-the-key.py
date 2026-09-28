# THE ANNOUNCEMENTS TAB ASKS workspace.manage, NOT announcement.manage: the member granted the key is sent past it.
# Reddens: announcement-access: "workspace Settings offers an Announcements tab — Publish, and the list with the paused one — to the member granted announcement.manage and to a workspace admin who is no platform admin"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  announcements: ['announcement.manage'],\n"
b = "  announcements: ['workspace.manage'],\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-11-tab-not-opened-by-the-key: the Announcements tab asks workspace.manage')
