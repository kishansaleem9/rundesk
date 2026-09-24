# EVERY FORM IS LISTED TO A GUEST, as to a member.
# Reddens: form-access: "a guest is listed no form, makes none (403, none made), and reads no form’s submissions"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.controller.ts'
a = "    if (req.workspaceMember?.role === 'guest') return []\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-5-guests-listed-forms: every form is listed to a guest')
