# A RENAME LEAVES THE FORMULAS THAT READ THE FIELD SAYING ITS OLD NAME (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# A rename writes the new name into every formula that reads the field. Let it
# write into none, and each such formula goes on naming a field that is not
# called that any more: the next edit of it is refused, "there is no field
# called …".
#
# Re-aimed 7 October: it removed the refusal of a rename while a formula read
# the field, which named the formula to whoever renamed it; a rename is no
# longer refused, and carries the formula with it.
#
# Reddens: custom-field-types: "renaming a field a formula reads carries the formula with it: the rename stands, the formula reads the new name, and it computes as before"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '        for (const f of formulas) {\n          if (f.id === def.id) continue\n'
b = '        for (const f of formulas.slice(0, 0)) {\n          if (f.id === def.id) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-field-types-11-rename-orphans-the-formula: a rename rewrites no formula')
