# A formula is allowed to read a text field. It parses, it saves, and it can only
# ever evaluate to nothing.
# Reddens: custom-field-types: "and a reference to a text field is refused, naming the field AND its type"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    const numeric: ReadonlySet<string> = new Set(FORMULA_NUMERIC_TYPES)\n'
b = "    const numeric: ReadonlySet<string> = new Set([...FORMULA_NUMERIC_TYPES, 'text', 'long_text'])\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: a formula may now read text fields.')
