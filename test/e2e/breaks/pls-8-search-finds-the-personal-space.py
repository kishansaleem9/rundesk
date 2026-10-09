# SEARCH FINDS THE PERSONAL SPACE.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made"
#
# A search for “Personal” offers a space nobody can go to.
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('            .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), ilike(spaces.name, like), spaceVisibilityFilter(this.db, userId, isManager)))\n',
     '            .where(and(eq(spaces.workspaceId, workspaceId), ilike(spaces.name, like), spaceVisibilityFilter(this.db, userId, isManager))) // BROKEN\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-8-search-finds-the-personal-space: SEARCH FINDS THE PERSONAL SPACE.')
