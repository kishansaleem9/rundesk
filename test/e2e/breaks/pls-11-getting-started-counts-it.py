# GETTING STARTED COUNTS THE PERSONAL SPACE AS A SPACE SOMEBODY MADE.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made"
#
# Opening Home ticks “make a space” off the checklist.
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      this.db.select({ c: cnt }).from(spaces).where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false))),\n',
     '      this.db.select({ c: cnt }).from(spaces).where(eq(spaces.workspaceId, workspaceId)), // BROKEN\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-11-getting-started-counts-it: GETTING STARTED COUNTS THE PERSONAL SPACE AS A SPACE SOMEBODY MADE.')
