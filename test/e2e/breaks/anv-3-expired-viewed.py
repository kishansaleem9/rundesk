# AN EXPIRED ANNOUNCEMENT IS VIEWED AND DISMISSED AGAIN: the live check forgets the expiry.
# Reddens: announcement-views: "an expired announcement is refused a view and a dismissal (404), and its counts stay 0 — nobody is shown it"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          eq(announcements.isActive, true),\n          or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date())),\n'
b = '          eq(announcements.isActive, true),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-3-expired-viewed: an expired announcement takes views and dismissals')
