# A GUEST JOINS ANY WHITEBOARD'S ROOM, and hears every stroke of it.
# Reddens: guest-canvas-scope: "a guest may not join a whiteboard’s realtime room — a member joins it"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "    if (kind === 'canvas' && membership.role === 'guest') return false\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-6-guests-join-canvas-rooms: a guest joins any canvas room')
