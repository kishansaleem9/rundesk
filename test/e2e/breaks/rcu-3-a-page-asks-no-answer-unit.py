# A PAGE ASKS FOR ITS ROOMS AND NO ANSWER, SO IT NEVER READS AFRESH (`found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`).
#
# `joinRooms` sends a page's subscribe asking for the server's answer, and reads
# afresh when it comes. Send it with none, as the pages did, and no page reads
# what was said while the server let its socket in.
#
# Reddens: unit: realtime.test.ts "a page’s rooms wait for the server’s answer, and then the page reads afresh what their events refresh; a room with nothing to read asks no answer"
import io
p = '/home/user/rundesk/apps/web/src/lib/realtime.ts'
a = "  if (catchUp) sock.emit('subscribe', { rooms }, () => catchUp())\n"
b = "  if (catchUp) sock.emit('subscribe', { rooms })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rcu-3-a-page-asks-no-answer-unit: joinRooms asks for no answer')
