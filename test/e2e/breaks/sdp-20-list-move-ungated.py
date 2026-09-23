# MOVELIST AS IT WAS: the source and the workspace checked, the destination not.
# Reddens: space-default-permission: "the member cannot move their own list into a project in the view-only space"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = "    await assertCanPlaceIn(this.db, { spaceId: dest.spaceId, projectId: targetProjectId, actorId, kind: 'list' })\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sdp-20-list-move-ungated: applied")
