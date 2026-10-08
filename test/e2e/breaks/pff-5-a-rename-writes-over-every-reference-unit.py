# A RENAME WRITES THE NEW NAME OVER EVERY REFERENCE OF THE FORMULA, READ FROM ITS UNIT TEST (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# Reddens: unit: formula.test.ts "a rename writes the new name over every reference to that field, and over no other, even one of the same name"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = "    if (ids[i]?.toLowerCase() !== fieldId.toLowerCase()) return\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-5-a-rename-writes-over-every-reference-unit: a rename writes over every reference')
