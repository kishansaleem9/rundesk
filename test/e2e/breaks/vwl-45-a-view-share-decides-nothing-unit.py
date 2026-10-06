# A SHARE ON A VIEW DECIDES NOTHING: the level on a view is the list's.
# Reddens: unit: view-write.test.ts "a share on the view decides before the list’s, in either direction"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = '  return viewShare ?? onList.level\n'
b = '  return onList.level\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-45-a-view-share-decides-nothing-unit: a share on a view decides nothing: the level on a view is the list's")
