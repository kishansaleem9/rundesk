# NO DELIVERY ADDS ANYTHING, whatever its maker may do.
# Reddens: unit: inbound-webhooks.service.test.ts "and makes the task when its maker still may"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = '      await this.tasks.assertCanCreateTaskIn(hook.listId, hook.createdById)\n'
b = "      await this.tasks.assertCanCreateTaskIn(hook.listId, hook.createdById)\n      throw new ForbiddenException('nothing is added')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('iws-3-no-delivery-adds-unit: no delivery adds')
