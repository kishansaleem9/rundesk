# A DELIVERY IS REFUSED WHATEVER ITS MAKER MAY DO: hooks made, and none of them adds anything.
# Reddens: inbound-hook-makers: "where they may add — Full edit — a member makes a hook, and a delivery to its address adds a task to the list, as them"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '    const stillMay = await this.tasks.canCreateTaskIn(hook.listId, hook.createdById)\n'
b = '    const stillMay = (await this.tasks.canCreateTaskIn(hook.listId, hook.createdById)) && hook.createdById === null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-5-deliveries-always-refused: applied')
