# A GUEST MAY ADD A HOOK, as one could — tasks added in the name of somebody who may not add tasks.
# Reddens: hook-portal-access: "a guest may not add a hook — none is made — while a member may, and is given its address"
import io
p = '/home/user/rundesk/apps/api/src/modules/inbound-webhooks/inbound-webhooks.service.ts'
a = "    if (ctx.role === 'guest') throw new ForbiddenException('Guests cannot add inbound webhooks')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-1-guests-add-hooks: applied")
