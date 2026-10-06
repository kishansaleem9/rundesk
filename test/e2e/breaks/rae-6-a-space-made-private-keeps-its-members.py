# A SPACE MADE PRIVATE KEEPS ITS MEMBERS' SOCKETS (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A private space is its members' (`checkContainerAccess`), and the sweep asks
# that of every socket in the rooms under it. Ask the container rule of a list's
# room as if every reader were a manager, whom it passes, and a member of a
# space made private keeps hearing its list.
#
# Reddens: realtime-access-ends:
#   "a member of a space made private stops hearing its list on a socket already open, while its maker hears it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "      { userId, workspaceRole },\n"
b = "      { userId, workspaceRole: 'workspace_admin' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-6-a-space-made-private-keeps-its-members: a list’s room asks its space and project as of a manager')
