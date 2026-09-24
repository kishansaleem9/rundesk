# A ROUTING ANSWER IS TAKEN AS SENT, not from the field's options: an anonymous
# submission files a task into any list of the workspace.
# Reddens: form-access: "a submission is filed only where the routing field offers — naming a list it does not offer, the private one, it is refused and files nothing; naming the one it offers, it files a task there"
import io
p = '/home/user/rundesk/apps/api/src/modules/forms/forms.service.ts'
a = '        } else if (!allowed.has(value)) {'
b = "        } else if (!allowed.has(value) && value === '') {"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fma-10-routing-answer-unchecked: a routing answer is taken as sent')
