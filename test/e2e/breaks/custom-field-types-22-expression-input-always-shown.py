# The expression box is rendered over every type, where it configures nothing —
# a control whose presence says a field has a setting it has not got.
# Reddens: custom-field-types: "and it goes away again for a type that has no expression"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "              {newFieldType === 'formula' && (\n                <input\n                  value={newFieldExpression}\n"
b = "              {(newFieldType === 'formula' || true) && (\n                <input\n                  value={newFieldExpression}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the expression input is shown for every type.')
