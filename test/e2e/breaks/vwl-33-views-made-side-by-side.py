# VIEWS MADE AT ONCE ARE MADE SIDE BY SIDE: each counts the list's shared views before the others are in,
# and each becomes its default.
# Reddens: view-writes-by-level: "six views made at once on an empty list leave it one default view, three times over"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/views.service.ts'
a = '      await lockListViews(tx, data.listId)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-33-views-made-side-by-side: views made at once are made side by side")
