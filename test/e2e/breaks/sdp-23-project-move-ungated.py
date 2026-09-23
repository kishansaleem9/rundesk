# MOVEPROJECT AS IT WAS: into any space of the workspace.
# Reddens: space-default-permission: "nor their own project into the view-only space"
import io
p = '/home/user/rundesk/apps/api/src/modules/projects/projects.service.ts'
a = "      await assertCanPlaceIn(this.db, { spaceId: destSpaceId, actorId, kind: 'project' })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-23-project-move-ungated: applied")
