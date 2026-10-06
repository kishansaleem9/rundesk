# NO ROOM PASS EVER STARTS, SO NO ROOM IS ASKED AGAIN (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The tick starts the session sweep and the room pass, each on its own. Let it
# start only the session sweep and every room a socket was let into is kept
# for good: the removed member, the unshared guest, the member lowered to
# guest and the members of a list and a space made private all go on hearing.
# It reddens all five of those checks; it claims the first.
#
# Reddens: realtime-access-ends:
#   "a member removed from the workspace stops hearing it on a socket already open — a task made in a list, a comment on a task, a message in a public channel, a doc renamed — while a member still in it hears every one"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (this.roomPass) this.roomPassDue = true\n    else this.startRoomPass()\n'
b = '    if (this.roomPass) this.roomPassDue = true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-1-the-sweep-asks-no-room: the tick starts no room pass, so no room is asked again')
