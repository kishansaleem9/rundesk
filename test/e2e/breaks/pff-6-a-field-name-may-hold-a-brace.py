# A FIELD'S NAME MAY HOLD A BRACE (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# A rename writes the new name into every formula that reads the field, and a
# formula reads `{` and `}` as the edges of a name, so a name holds neither.
# Let it, and a field is made with one, and Budget renamed "Budget}" leaves its
# formula reading `({Budget}} - {Spent}) * 2`.
#
# Reddens: custom-field-types: "a field’s name may not hold { or }: made or renamed so, it is refused in one sentence, and the fields and the formula reading them are as they were"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "  if (typeof name === 'string' && /[{}]/.test(name)) throw new BadRequestException(FIELD_NAME_BRACES)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-6-a-field-name-may-hold-a-brace: a field’s name may hold a brace')
