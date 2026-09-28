# THE ANNOUNCEMENTS TAB OPENS TO A KEY MANAGERS HOLD: Settings offers the manager Announcements.
# Reddens: announcement-access: "the manager is offered no Announcements tab and no Publish — Settings takes them to a tab of theirs instead — and the platform console turns them away"
import io
p = '/home/user/rundesk/apps/web/src/hooks/use-settings-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  announcements: ['announcement.manage'],\n"
b = "  announcements: ['announcement.manage', 'members.profile.manage'],\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-10-tab-opens-to-managers: the Announcements tab opens to members.profile.manage')
