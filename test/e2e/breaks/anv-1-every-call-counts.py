# EVERY CALL COUNTS A VIEW AGAIN: the count moves whether or not the person's row is new.
# Reddens: announcement-views: "three views by one member and one by another count two — one per person, each recorded once"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (inserted.length === 0) return false\n'
b = '    if (inserted.length === 0 && Boolean(0)) return false\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-1-every-call-counts: a view counts on every call')
