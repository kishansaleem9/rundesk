# A FIELD IS FOUND BY ITS ID ALONE: deleted or relabelled under any form.
# Reddens: form-access: "a field is changed only under its own form, in its own workspace — relabelled from another organisation, or deleted under another form, it is not found and stays; and a body naming another form does not move one onto it"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/form-in-workspace.guard.ts'
a = '        .where(and(eq(formFields.id, fieldId), eq(formFields.formId, formId)))'
b = '        .where(and(eq(formFields.id, fieldId)))'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-2-field-under-any-form: a field is found by its id alone')
