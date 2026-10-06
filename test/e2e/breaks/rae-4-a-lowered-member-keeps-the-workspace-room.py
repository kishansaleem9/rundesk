# A MEMBER LOWERED TO GUEST KEEPS THE WORKSPACE'S ROOM AT THE SWEEP (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The workspace's room carries every public channel's messages, and a guest
# may not be in it. Let the sweep (only the sweep: a subscribe still refuses
# a guest) keep a guest there, and a member lowered to guest goes on hearing
# the workspace's channel.
#
# Reddens: realtime-access-ends:
#   "a member lowered to guest stops hearing the workspace’s room and a list nothing shares with them on a socket already open, while a member hears both"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (kind === 'workspace' && membership.role === 'guest') return false\n"
b = "    if (kind === 'workspace' && membership.role === 'guest' && !reads) return false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-4-a-lowered-member-keeps-the-workspace-room: the sweep keeps a guest in the workspace’s room')
