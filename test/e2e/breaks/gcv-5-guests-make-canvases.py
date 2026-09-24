# A GUEST MAKES WHITEBOARDS, which nothing could then share with anybody.
# Reddens: guest-canvas-scope: "a guest makes no whiteboard (403, none made) — a member does"
import io
p = '/home/user/rundesk/apps/api/src/modules/canvases/canvases.service.ts'
a = "    if (!this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')\n    await this.assertNotGuest(workspaceId, userId)\n"
b = "    if (!this.isSupportedType(body.type)) throw new BadRequestException('Unsupported canvas type')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gcv-5-guests-make-canvases: a guest makes canvases')
