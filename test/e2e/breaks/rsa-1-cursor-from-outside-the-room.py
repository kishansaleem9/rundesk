# A CURSOR FROM A SOCKET NOT IN THE CANVAS'S ROOM IS RELAYED INTO IT again: anyone who names
# a canvas draws on it.
# Reddens: realtime-sends-access: "a cursor on a whiteboard comes only from a socket on that board, under its account’s name — not from a member who has not opened it, a member removed from the workspace or an account never in it, and not under a name the sender chose"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = "      return { ok: false }\n    }\n    const room = `canvas:${body.canvasId}`\n    if (!client.rooms.has(room)) return { ok: false }\n    const event: RealtimeEvent = {\n      type: 'canvas.cursor',\n"
b = "      return { ok: false }\n    }\n    const room = `canvas:${body.canvasId}`\n    const event: RealtimeEvent = {\n      type: 'canvas.cursor',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a cursor from outside the room is relayed.')
