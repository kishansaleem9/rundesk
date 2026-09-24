# A FIELD UPDATE SETS WHATEVER THE BODY SENDS again: a formId moves the field
# onto another form.
# Reddens: form-access: "a field is changed only under its own form, in its own workspace — relabelled from another organisation, or deleted under another form, it is not found and stays; and a body naming another form does not move one onto it"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = "    const next: Record<string, unknown> = {}\n    for (const key of ['type', 'label', 'placeholder', 'helpText', 'isRequired', 'position', 'taskField'] as const) {\n      if (patch[key] !== undefined) next[key] = patch[key]\n    }\n"
b = '    const next: Record<string, unknown> = { ...patch }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-3-field-body-spread: a field update sets whatever the body sends')
