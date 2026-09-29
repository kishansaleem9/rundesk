# A MEMBER'S OWN CAPACITY ASKS THE PROFILE PERMISSION AGAIN.
# Reddens: own-capacity: "a plain member sets their own weekly capacity (200), and 30 hours is stored"
#   or "the plain member’s Workload offers a capacity control on their own row and on nobody else’s, and setting 32 hours through it saves them"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '      userId !== user.id &&\n'
b = '      (userId !== user.id || Boolean(1)) &&\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ocp-1-own-asks-the-key: setting one's own capacity asks the key")
