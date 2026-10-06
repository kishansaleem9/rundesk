# A LIST MADE PRIVATE KEEPS ITS MEMBERS' SOCKETS (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A private list is its maker's (and the managers'), and the sweep asks that
# of every socket in its room. Drop the private-list rule from the room's
# question and a member whose list was made private keeps hearing it.
#
# Reddens: realtime-access-ends:
#   "a member of a list made private stops hearing it on a socket already open, while its maker hears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (!canSeePrivateItem({ visibility: chain.listVisibility, createdById: chain.listCreatedById }, { userId, isManager: false })) {\n"
b = "    if (!canSeePrivateItem({ visibility: chain.listVisibility, createdById: chain.listCreatedById }, { userId, isManager: true })) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-5-a-list-made-private-keeps-its-members: a list’s room asks nothing of a private list')
