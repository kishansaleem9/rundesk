# Formula is offered in the picker with nowhere to put its expression, so the only
# thing the entry can produce is a 400 — a dead control with a server behind it.
# Reddens: custom-field-types: "choosing Formula asks for the expression, rather than letting the save 400"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "              {newFieldType === 'formula' && (\n                <input\n                  value={newFieldExpression}\n"
b = "              {newFieldType === 'formula' && false && (\n                <input\n                  value={newFieldExpression}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('quick-create-modal.tsx: the expression input is never rendered.')
