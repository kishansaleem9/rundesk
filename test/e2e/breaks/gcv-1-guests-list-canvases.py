# EVERY WHITEBOARD AND MIND MAP IS LISTED TO A GUEST, as to a member.
# Reddens: guest-canvas-scope: "a guest is listed no whiteboard and no mind map — a member is listed the board"
import io
p = '/home/user/rundesk/apps/api/src/modules/canvases/canvases.service.ts'
a = '    if (actorId && (await this.isGuest(workspaceId, actorId))) return []\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-1-guests-list-canvases: every canvas is listed to a guest')
