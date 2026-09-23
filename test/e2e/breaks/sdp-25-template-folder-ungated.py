# TEMPLATE APPLY AS IT WAS: a folder template made into any space.
# Reddens: space-default-permission: "nor apply a template into the view-only space — nothing is created there"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "        await assertCanPlaceIn(this.db, { spaceId: space.id, actorId: userId, kind: 'project' })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-25-template-folder-ungated: applied")
