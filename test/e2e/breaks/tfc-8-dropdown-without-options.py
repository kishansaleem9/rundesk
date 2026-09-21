# A dropdown can be created with no options, so the field exists and can never
# hold a value — the task door skipping a rule the project door applies.
# Reddens: task-field-create — "a dropdown with no options is refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    if ((dto.type === 'dropdown' || dto.type === 'labels') && (!dto.options || dto.options.length === 0)) {"
b = "    if (false) {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("custom-fields.service.ts: a dropdown may now be created with no options at all.")
