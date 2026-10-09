# SEARCH'S SPACES WITH NO RULE, as they were: a private space found by its own name.
# Reddens: search-read-access: "a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '            .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), ilike(spaces.name, like), spaceVisibilityFilter(this.db, userId, isManager)))\n'
b = '            .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), ilike(spaces.name, like)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-8-search-spaces-unruled: applied")
