# A stroke of one point is stored. It validates, it round-trips, and it draws
# nothing at all — a value that is valid and invisible.
# Reddens: custom-field-types: "a stroke of one point is refused — it would store as valid and draw as nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    if (points.length < 2) {\n'
b = '    if (points.length < 1) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a one-point stroke is now a valid signature.')
