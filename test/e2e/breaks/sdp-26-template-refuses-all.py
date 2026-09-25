# A TEMPLATE THAT CANNOT BE APPLIED ANYWHERE.
# Reddens: space-default-permission: "while applying it into a space they may add to makes it there"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "        await assertCanPlaceIn(this.db, { spaceId: space.id, actorId: userId, kind: 'project' })\n"
b = "        throw new BadRequestException('No')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-26-template-refuses-all: applied")
