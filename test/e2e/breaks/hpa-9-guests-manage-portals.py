# A GUEST MAY LIST PORTALS AND MAKE THEM, as one could.
# Reddens: hook-portal-access: "a guest may neither list the project’s portals nor make one"
import io
p = '/home/user/rundesk/apps/api/src/modules/client-portal/client-portal.service.ts'
a = "    if (member.role === 'guest') throw new ForbiddenException('Guests cannot manage client portals')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("hpa-9-guests-manage-portals: applied")
