# A GUEST MAKES FORMS AND READS THEIR SUBMISSIONS, which nothing shares with them.
# Reddens: form-access: "a guest is listed no form, makes none (403, none made), and reads no form’s submissions"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/form-in-workspace.guard.ts'
a = "    if (role === 'guest' && ctx.getHandler().name !== 'list') throw new ForbiddenException('Guests have no forms')"
b = "    if (role === 'guest' && ctx.getHandler().name !== 'list' && workspaceId === '') throw new ForbiddenException('Guests have no forms')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-4-guests-manage-forms: a guest makes and reads forms')
