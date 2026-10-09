# THE PEOPLE LIST LEAVES THE SWITCHES OUT: nobody can read them, and the People tab offers none.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "the People list answers each member’s and guest’s view-only permissions at ClickUp’s defaults — time estimates and time tracking on, tags and creating views off — as the database holds them"
#   or "the People tab offers the admin each member’s and guest’s view-only permissions and a manager’s none, draws the member’s four as the server holds them, and turning time tracking and estimates on and tags off there saves each, creating views as it was"
#   or "and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add"
#   or "and a timer the member starts from it runs, read back by SQL"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        viewOnlyPermissions: viewOnlyPermissionsOf({ viewOnlyTimeEstimates, viewOnlyTimeTracking, viewOnlyTags, viewOnlyCreateViews }),\n',
     '        // BROKEN: the roster leaves the switches out\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-9-the-roster-leaves-them-out: the roster leaves them out')
