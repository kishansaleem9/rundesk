# A SECTION STORED TWICE IS DRAWN TWICE: the reader passes the stored list through without taking out a repeat.
# Reddens: rail-reorder: "a stored name that is no section, and a repeat, are passed over: the rail draws Today & overdue, then Priorities, once each"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
a = '    if (section && !shown.includes(section)) shown.push(section)\n'
b = '    if (section) shown.push(section)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-5-a-repeat-is-drawn-twice: railSectionsShown keeps repeats')
