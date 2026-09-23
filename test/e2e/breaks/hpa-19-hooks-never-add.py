# NO HOOK ADDS ANYTHING: the refusal half with no grant half.
# Reddens: hook-portal-access: "the member’s hook adds a task while they are a member — and none once they have left"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "    if (!stillMay) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')\n"
b = "    if (!stillMay || stillMay) throw new ForbiddenException('This webhook’s creator can no longer add tasks to its list')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-19-hooks-never-add: applied")
