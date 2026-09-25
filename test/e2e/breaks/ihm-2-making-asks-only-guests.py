# MAKING A HOOK ASKS ONLY THAT ITS MAKER IS NOT A GUEST, as it did — hooks every delivery to which is refused.
# Reddens: inbound-hook-makers: "a member who may not add tasks to a list makes no hook on it — refused in a view-only, a comment-only and an Edit space (403), and none is stored"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    await this.tasks.assertCanCreateTaskIn(listId, createdById)\n'
b = "    if ((await this.listContext(listId, createdById))?.role === 'guest') throw new ForbiddenException('Guests cannot add inbound webhooks')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-2-making-asks-only-guests: applied')
