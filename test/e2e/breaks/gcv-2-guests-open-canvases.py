# A GUEST OPENS ANY WHITEBOARD by id, as a member does.
# Reddens: guest-canvas-scope: "a guest may not open, rename or delete one (refused, both unchanged) — a member opens it"
import io
p = '/home/user/rundesk/apps/api/src/modules/canvases/canvases.service.ts'
a = "    if (actorId && (await this.isGuest(workspaceId, actorId))) throw new NotFoundException('Canvas not found')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-2-guests-open-canvases: a guest opens any canvas')
