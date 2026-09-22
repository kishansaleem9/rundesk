# `GET /workspaces/:id/members` goes behind the admin guard, so All People is
# empty for a member.
#
# The same wall as `td-1`, on the other destination, and worth its own patch
# because the two endpoints live in different modules with different guards:
# the groups listing is on `WorkspaceGroupsController` and the members listing
# is on `WorkspacesController`, twenty lines above a `@Post` that legitimately
# requires admin. Fixing one and forgetting the other is exactly what a wall
# spread across two files invites.
#
# `WorkspaceMemberGuard` → `WorkspaceAdminGuard` is one word in a line that
# already names a guard, in a file where the very next route uses the admin
# one. Nothing about it looks like a change in who may look.
#
# THE PAGE SURVIVES IT, WHICH IS THE PROBLEM. All People renders its card grid
# from an empty list, so a plain member sees an organisation with nobody in it
# — on the page whose entire purpose is to let them see the organisation
# without admin rights.
#
# ONE CHECK. The teams listing is a different controller and stays green, the
# route still admits a member, My Teams still renders, the tab count is
# unchanged.
#
# Reddens: teams-destination: "and the people"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.controller.ts'
a = """  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
"""
b = """  @Get(':workspaceId/members')
  @UseGuards(WorkspaceAdminGuard)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspaces.controller.ts: listing the people requires admin again.')
