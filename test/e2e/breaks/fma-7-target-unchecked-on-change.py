# A FORM IS MOVED TO FILE INTO ANY LIST of its workspace, one its maker is
# refused included.
# Reddens: form-access: "a member routes no form, new or changed, to a list they are refused (none made or moved) — one to an open list they may add to is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = "    if (typeof patch.targetListId === 'string') await this.assertMayFileInto(actor.workspaceId, patch.targetListId, actor.id)\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-7-target-unchecked-on-change: a form is moved to any list')
