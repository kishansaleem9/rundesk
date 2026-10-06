# A HOOK KEEPS ADDING TASKS IN ITS CREATOR'S NAME AFTER THEY HAVE LEFT, as it did.
# Re-aimed 6 October: the delivery asks the create gate itself, to tell the trash apart.
# Reddens: hook-portal-access: "the member’s hook adds a task while they are a member — and none once they have left"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "      if (err instanceof HttpException) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')\n      throw err\n"
b = '      if (!(err instanceof HttpException)) throw err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('hpa-18-hooks-outlive-their-creator: applied')
