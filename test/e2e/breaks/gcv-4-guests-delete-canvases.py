# A GUEST DELETES ANY MIND MAP, or whiteboard.
# Reddens: guest-canvas-scope: "a guest may not open, rename or delete one (refused, both unchanged) — a member opens it"
import io
p = '/home/user/rundesk/apps/api/src/modules/canvases/canvases.service.ts'
a = '  async remove(workspaceId: string, canvasId: string, actorId: string) {\n    await this.assertNotGuest(workspaceId, actorId)\n'
b = '  async remove(workspaceId: string, canvasId: string, actorId: string) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-4-guests-delete-canvases: a guest deletes any canvas')
