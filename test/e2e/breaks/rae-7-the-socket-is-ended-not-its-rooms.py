# A ROOM ITS PERSON MAY NO LONGER READ CLOSES THE WHOLE SOCKET (`found-6-oct/an-open-socket-outlives-its-access`).
#
# The room pass takes a refused room out of the socket and leaves the socket
# open: it carries the person's other workspaces too, and the web does not
# open again a socket the server has closed. Close the socket instead and the
# removed member loses their own workspace's channel with it. Also reddens the
# access-comes-back check: a socket it closed cannot hear again.
#
# Reddens: realtime-access-ends:
#   "the removed member’s socket stays open and still hears their own workspace: what ends is what the workspace sends them, not the socket that carries their other workspaces"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '      if (!may && holds) holder.leave(question.room)\n'
b = '      if (!may && holds) holder.disconnect(true)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-7-the-socket-is-ended-not-its-rooms: a refused room closes the whole socket')
