# THE CALENDAR SYNC OFFERS THE PERSONAL SPACE AS A PLACE.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made"
#
# The sync picker draws a space that is no place of the hierarchy.
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-sync-rules.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('.where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false), eq(spaces.isPersonal, false), spaceVisibilityFilter(this.db, actorId, isManager)))',
     '.where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false), spaceVisibilityFilter(this.db, actorId, isManager))) // BROKEN'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-9-the-sync-places-hold-it: THE CALENDAR SYNC OFFERS THE PERSONAL SPACE AS A PLACE.')
