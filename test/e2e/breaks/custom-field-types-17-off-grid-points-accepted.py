# A point far outside the box the signature is drawn in is stored, so the drawing
# renders off the edge of its own pad.
# Reddens: custom-field-types: "and a point outside the box it is drawn in is refused, naming the point"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '      if (!/^\\d{1,4}$/.test(n) || Number(n) > SIGNATURE_GRID) {\n'
b = '      if (!/^\\d{1,9}$/.test(n) || Number(n) > 100000) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: points outside the drawing box are accepted.')
