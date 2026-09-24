# ROOMS THAT REFUSE EVERY NON-MANAGER: nobody but an admin hears a list change live.
# Reddens: workspace-read-access: "while they join an open list’s room and hear a task made there — and the admin joins the private list’s room and hears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (isManagerRole(workspaceRole)) return true\n    let listId = id\n'
b = '    if (isManagerRole(workspaceRole)) return true\n    if (userId) return false\n    let listId = id\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-22-rooms-refuse-everyone: applied")
