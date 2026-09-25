# MAKING A HOOK ASKS NOTHING OF ITS MAKER: anybody who reads the list makes one.
# Reddens: inbound-hook-makers: "a member who may not add tasks to a list makes no hook on it — refused in a view-only, a comment-only and an Edit space (403), and none is stored"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    await this.tasks.assertCanCreateTaskIn(listId, createdById)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-1-making-asks-nothing: applied')
