# EVERY DISMISSAL COUNTS AGAIN: the count moves whether or not the person's row is new.
# Reddens: announcement-views: "a member who dismisses without having viewed is counted a viewer too, once, and two dismissals by them are one"
import io
p = '/home/user/rundesk/apps/api/src/modules/announcements/announcements.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (inserted.length > 0) {\n'
b = '    if (inserted.length >= 0) {\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('anv-5-every-dismissal-counts: a dismissal counts on every call')
