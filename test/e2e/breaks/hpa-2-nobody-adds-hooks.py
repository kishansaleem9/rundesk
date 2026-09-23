# NOBODY MAY ADD A HOOK: the refusal half with no grant half.
# Reddens: hook-portal-access: "a guest may not add a hook — none is made — while a member may, and is given its address"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "    if (ctx.role === 'guest') throw new ForbiddenException('Guests cannot add inbound webhooks')\n"
b = "    if (ctx.role !== 'nobody') throw new ForbiddenException('Guests cannot add inbound webhooks')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-2-nobody-adds-hooks: applied")
