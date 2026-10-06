# A DATE TYPED ONLY IN PART CLEARS THE DATE (`found-30-sep/sheet-dates-write-as-typed`): a box with a segment
# emptied reads '', and leaving it writes no date.
# Reddens: unit: date-box.test.ts "writes nothing for a date typed only in part, or for the date stored"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = "  if (badInput) return { kind: 'discard' }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sdt-2-a-half-typed-date-clears-the-date-unit: a half-typed date is written as no date')
