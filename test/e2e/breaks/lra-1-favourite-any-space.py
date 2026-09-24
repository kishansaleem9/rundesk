# A SPACE FAVOURITED BY ID WITH NO RULE, as it was: a private space's name to anyone.
# Reddens: lookup-read-access: "a member cannot favourite anything of a space they are refused, nor a channel closed to them (404 each, no row) — while they favourite the open ones"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '        .where(and(eq(spaces.workspaceId, workspaceId), inArray(spaces.id, ids), spaceVisibilityFilter(this.db, actor.id, actor.isManager)))\n'
b = '        .where(and(eq(spaces.workspaceId, workspaceId), inArray(spaces.id, ids)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-1-favourite-any-space: applied")
