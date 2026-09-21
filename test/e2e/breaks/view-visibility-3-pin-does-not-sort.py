# Pinning still writes `isPinned` and the strip stops reading it, so the pin
# control works and changes nothing anybody can see. The mirror defect: a
# stored value no reader honours.
#
# Reddens: view-visibility: "and pinning it sorts it to the front of the strip"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '      .orderBy(desc(taskViews.isPinned), asc(taskViews.position), asc(taskViews.createdAt))\n'
b = '      .orderBy(asc(taskViews.position), asc(taskViews.createdAt))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('views.service.ts: pinning a view no longer moves it to the front.')
