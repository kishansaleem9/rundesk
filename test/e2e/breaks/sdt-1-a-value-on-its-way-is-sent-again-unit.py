# A DATE ALREADY ON ITS WAY IS SENT AGAIN (`found-30-sep/sheet-dates-write-as-typed`): Enter writes it, and leaving
# the box writes it a second time.
# Reddens: unit: date-box.test.ts "writes the date typed, once: as the instant it means, and not again while it is on its way"
import io
p = '/home/user/rundesk/apps/web/src/lib/date-box.ts'
a = "  if (draft === sending) return { kind: 'none' }\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('sdt-1-a-value-on-its-way-is-sent-again-unit: a value on its way is written again')
