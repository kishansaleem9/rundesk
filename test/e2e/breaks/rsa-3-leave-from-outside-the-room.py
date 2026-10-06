# A CURSOR'S LEAVE FROM OUTSIDE THE ROOM IS RELAYED again: anyone can take a person's cursor
# off somebody's board.
# Reddens: realtime-sends-access: "a cursor on a whiteboard comes only from a socket on that board, under its account’s name — not from a member who has not opened it, a member removed from the workspace or an account never in it, and not under a name the sender chose"
import io
p = '/home/user/rundesk/apps/api/src/modules/realtime/realtime.gateway.ts'
a = '    if (!data?.userId || !body?.canvasId) return { ok: false }\n    const room = `canvas:${body.canvasId}`\n    if (!client.rooms.has(room)) return { ok: false }\n'
b = '    if (!data?.userId || !body?.canvasId) return { ok: false }\n    const room = `canvas:${body.canvasId}`\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('realtime.gateway.ts: a leave from outside the room is relayed.')
