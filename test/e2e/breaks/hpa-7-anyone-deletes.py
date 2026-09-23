# ANY MEMBER MAY DELETE ANYBODY'S HOOK, as they could.
# Reddens: hook-portal-access: "a member may not delete the admin’s hook — it stays — while the admin may delete a member’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "    if (hook.createdById !== actor.id && actor.role !== 'super_admin') {\n"
b = "    if (hook.createdById !== actor.id && actor.role !== 'super_admin' && actor.id === 'nobody') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-7-anyone-deletes: applied")
