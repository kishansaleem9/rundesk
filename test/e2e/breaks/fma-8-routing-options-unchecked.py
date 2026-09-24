# A ROUTING FIELD OFFERS ANY LIST of its workspace, one its maker is refused
# included.
# Reddens: form-access: "a member’s routing field may not offer a list they are refused, nor be one a submitter types into (none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '      if (!listId) continue\n      await this.assertMayFileInto(workspaceId, listId, actorId)\n'
b = '      if (!listId) continue\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-8-routing-options-unchecked: a routing field offers any list')
