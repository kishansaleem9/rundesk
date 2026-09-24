# A SPRINT IS FILED IN ANY SPACE OF THE WORKSPACE: a private one the maker is refused, a view-only one.
# Reddens: sprint-access: "a sprint is not made in a private space the member is refused, under another workspace’s space, in a view-only space, or by a guest — a member makes one in the open space"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "      await assertCanPlaceIn(this.db, { spaceId: data.spaceId, actorId: actor.id, kind: 'sprint' })\n"
b = '      void assertCanPlaceIn\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-5-made-anywhere: applied")
