# THE PERSONAL SPACE IS LISTED AMONG THE WORKSPACE’S SPACES.
# (`found-24-sep/planner-default-list-read-by-nothing`)
# Reddens: personal-list: "it is no place in the hierarchy: the sidebar’s spaces, search, the calendar sync’s places and the pickers of lists leave its space out, and getting started counts no space or project more once a Personal List is made"
#   or "Home’s Personal List draws her tasks — the old to-dos and the task moved in — and the sidebar draws the workspace’s space and no personal one"
#
# The sidebar draws a space called “Personal”, holding everybody’s Personal Lists’ container.
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const base = and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false), eq(spaces.isPersonal, false))\n',
     '    const base = and(eq(spaces.workspaceId, workspaceId), eq(spaces.isArchived, false)) // BROKEN: the personal space is a space\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pls-7-the-personal-space-is-a-space: THE PERSONAL SPACE IS LISTED AMONG THE WORKSPACE’S SPACES.')
