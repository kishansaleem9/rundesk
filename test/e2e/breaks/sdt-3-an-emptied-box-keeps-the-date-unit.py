# AN EMPTIED DATE BOX KEEPS THE DATE (`found-30-sep/sheet-dates-write-as-typed`): clearing a date, which the box
# always did, writes nothing.
# Reddens: unit: date-box.test.ts "clears the date when the box is emptied, as clearing always did"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = "  if (draft === '') return { kind: 'write', iso: null }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sdt-3-an-emptied-box-keeps-the-date-unit: an emptied box writes nothing')
