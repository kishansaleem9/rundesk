# A PAGE SUBSCRIBES ON THE SOCKET ITSELF, NOT THROUGH `joinRooms` (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`).
#
# Every page asks for its rooms through `joinRooms`, so each reads afresh once
# the server holds them; one that emits its own subscribe reads nothing. Put
# the canvas cursors back on a bare emit, as every page was.
#
# Reddens: unit: realtime.test.ts "no page asks for a room but through joinRooms, so none goes on showing only what it read before its room was held"
import io
p = '/home/user/rundesk/apps/web/src/lib/use-canvas-cursors.tsx'
a = "    joinRooms(socket, [room])\n"
b = "    socket.emit('subscribe', { rooms: [room] })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rcu-4-a-page-subscribes-by-itself-unit: the canvas cursors subscribe on the socket themselves')
