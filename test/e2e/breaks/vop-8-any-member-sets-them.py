# ANY MEMBER SETS THE SWITCHES: the route asks membership alone, not members.role.change.
# (`found-25-sep/view-only-individual-permissions`)
# Reddens: view-only-permissions: "only those who may change roles set them: the member themself and a manager are refused (403); a name that is no switch, a value that is not true or false and an empty change are refused in words (400), somebody who is no member is not found (404), and the member’s switches are as they were"
#   or "the member’s sheet offers no Start timer and no manual entry, and says their workspace has not allowed them to track time there; the estimate cannot be typed in; and a tag can be added"
#   or "the People tab offers the admin each member’s and guest’s view-only permissions and a manager’s none, draws the member’s four as the server holds them, and turning time tracking and estimates on and tags off there saves each, creating views as it was"
#   or "and the member’s sheet follows: Start timer and a manual entry again, no word that they may not track time, an estimate to type, and no tag to add"
#   or "and a timer the member starts from it runs, read back by SQL"
#
# Re-aimed 8 October: the last 4 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  @Patch(':workspaceId/members/:userId/view-only-permissions')\n  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('members.role.change')\n",
     "  @Patch(':workspaceId/members/:userId/view-only-permissions')\n  @UseGuards(WorkspaceMemberGuard) // BROKEN: any member sets them\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('vop-8-any-member-sets-them: any member sets them')
