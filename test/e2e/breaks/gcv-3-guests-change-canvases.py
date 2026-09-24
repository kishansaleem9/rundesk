# A GUEST RENAMES ANY WHITEBOARD, and rewrites it.
# Reddens: guest-canvas-scope: "a guest may not open, rename or delete one (refused, both unchanged) — a member opens it"
import io
p = '/home/user/rundesk/apps/api/src/modules/canvases/canvases.service.ts'
a = "    if (body.type && !this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')\n    await this.assertNotGuest(workspaceId, actorId)\n"
b = "    if (body.type && !this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-3-guests-change-canvases: a guest renames any canvas')
