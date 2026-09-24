# A ROUTING FIELD MAY BE ONE A SUBMITTER TYPES INTO: whatever list id they type.
# Reddens: form-access: "a member’s routing field may not offer a list they are refused, nor be one a submitter types into (none made)"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = "    if (field.type !== 'dropdown' && field.type !== 'multi_select') {"
b = "    if (field.type !== 'dropdown' && field.type !== 'multi_select' && field.type === '') {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-9-routing-typed-in: a routing field may be typed into')
