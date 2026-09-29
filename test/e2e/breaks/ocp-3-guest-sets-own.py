# A GUEST SETS THEIR OWN CAPACITY.
# Reddens: own-capacity: "a guest setting their own capacity is refused (403): “A guest has no capacity to set” — a guest is not in the Workload"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (actor?.id === userId && previous.role === 'guest') {\n"
b = "    if (actor?.id === userId && previous.role === 'guest' && Boolean(0)) {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ocp-3-guest-sets-own: a guest sets their own')
