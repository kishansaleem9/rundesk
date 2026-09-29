# EVERY ROW OFFERS THE CONTROL TO EVERYBODY.
# Reddens: own-capacity: "the plain member’s Workload offers a capacity control on their own row and on nobody else’s, and setting 32 hours through it saves them"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-workload-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "    Boolean(userId) && ((userId === me?.id && myRole !== 'guest') || mayManageProfiles)\n"
b = "    Boolean(userId) && ((userId === me?.id && myRole !== 'guest') || mayManageProfiles || Boolean(1))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-7-every-row-offered: every row is offered')
