# A SPRINT IS CHANGED WHATEVER THE SPACE'S LEVEL: a view-only space's sprint is renamed.
# Reddens: sprint-access: "a member neither renames nor deletes a private space’s sprint, nor renames a view-only space’s, and a guest, given no sprint, renames none — a member renames the open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "    if (at.spaceId) await assertSpaceLevel(this.db, { spaceId: at.spaceId, actorId: actor.id, required: 'edit', kind: 'sprints' })\n"
b = '    void assertSpaceLevel\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-8-changed-at-any-level: applied")
