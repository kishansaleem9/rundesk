# SHOWING THE BANNER RECORDS NO VIEW.
# Reddens: announcement-views: "showing the banner records the member’s view, and a second visit records nothing more"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    if (!workspaceId || !shownAnnouncementId) return\n'
b = '    if (!workspaceId || !shownAnnouncementId || Boolean(1)) return\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-7-banner-records-nothing: the banner records no view')
