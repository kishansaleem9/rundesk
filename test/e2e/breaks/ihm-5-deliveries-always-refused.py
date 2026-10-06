# A DELIVERY IS REFUSED WHATEVER ITS MAKER MAY DO: hooks made, and none of them adds anything.
# Re-aimed 6 October: the delivery asks the create gate itself, to tell the trash apart.
# Reddens: inbound-hook-makers: "where they may add — Full edit — a member makes a hook, and a delivery to its address adds a task to the list, as them"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      await this.tasks.assertCanCreateTaskIn(hook.listId, hook.createdById)\n'
b = "      await this.tasks.assertCanCreateTaskIn(hook.listId, hook.createdById)\n      if (hook.createdById !== null) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ihm-5-deliveries-always-refused: applied')
