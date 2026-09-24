# A FORM IS FOUND BY ITS ID ALONE again: through a workspace of their own,
# anybody reads, changes, copies and archives another organisation's form.
# Reddens: form-access: "a form is not found through another organisation’s workspace — not read, its submissions not listed, not renamed, given a field, copied or archived (all unchanged) — and its own admin reads the submission"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/form-in-workspace.guard.ts'
a = '        .where(and(eq(forms.id, formId), eq(forms.workspaceId, workspaceId)))'
b = '        .where(and(eq(forms.id, formId)))'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-1-form-by-id-anywhere: a form is found by its id alone')
