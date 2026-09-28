# THE LIVE BANNER KEEPS PAUSED ANNOUNCEMENTS: every member reads the paused one too.
# Reddens: announcement-access: "every member reads the live banner — the plain member, the manager and the granted member get it (200), never the paused one — and a dismissal hides it for the one who dismissed it alone"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          eq(announcements.isActive, true),\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ana-6-live-banner-shows-paused: listActive no longer filters isActive')
