# TIME SPENT'S ` "900000"` KEEPS ITS QUOTES, so it is no duration and the time tracked is dropped.
# Reddens: clickup-current-export: "priority, the due date to the millisecond, start and created dates, the estimate and the time tracked are the export’s"
import io
p = '/home/user/rundesk/packages/imports/src/clickup-current-export.ts'
a = '  if (/^"[^"]*"$/.test(v)) v = v.slice(1, -1).trim()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("cce-7-a-quoted-number-stays-quoted: applied")
