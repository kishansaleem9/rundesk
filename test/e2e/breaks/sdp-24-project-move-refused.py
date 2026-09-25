# MOVING A PROJECT BETWEEN SPACES REFUSED OUTRIGHT.
# Reddens: space-default-permission: "while moving it into another space they may add to works"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
a = "      await assertCanPlaceIn(this.db, { spaceId: destSpaceId, actorId, kind: 'project' })\n"
b = "      throw new BadRequestException('No')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-24-project-move-refused: applied")
