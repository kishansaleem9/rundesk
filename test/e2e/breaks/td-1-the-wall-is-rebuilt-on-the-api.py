# `GET /workspaces/:id/groups` goes back behind the admin guard.
#
# The suite's header says what the whole item is: three of the four
# destinations already existed and "all three sat inside workspace settings,
# whose route redirects any non-admin back to `/app`. So looking at your own
# organisation required admin rights. The whole item is removing that wall."
#
# This is the wall rebuilt one layer down. The page is reachable, the tabs
# render, the route lets a member in — and the list behind the first tab answers
# 403, so a plain member sees an empty Teams page on a workspace that has
# teams. An empty list is the worst available answer here, because it is
# indistinguishable from "you are in no teams", which is the message the frame
# puts on this very page.
#
# `WorkspaceAdminGuard` is already imported in this file and used on every
# write below, so adding it to the read is one line that looks like
# consistency.
#
# AND IT MATTERS THAT THE SUITE RUNS AS A MEMBER. Its header: "the check that
# matters is driven as somebody who is NOT an admin. Run as the seeded admin it
# would pass no matter what." This patch is invisible to any run that forgot
# that.
#
# IT REDDENS FOUR, NOT THE ONE PREDICTED, AND ALL FOUR ARE HONEST. The 403
# itself; the teams list being empty; the per-team row reading ""; and My Teams
# being empty after the member is added to a team — because `myTeams` filters
# the same `groups` array that is now empty. One endpoint, four assertions that
# all read through it. I counted the endpoint and not its readers, which is the
# same miscount as `lus-1`.
#
# Reddens: teams-destination: "a plain member may list the teams"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspace-groups/workspace-groups.controller.ts'
a = """  @Get()
  list(@Param('workspaceId') workspaceId: string, @Query('search') search?: string) {
"""
b = """  @Get()
  @UseGuards(WorkspaceAdminGuard)
  list(@Param('workspaceId') workspaceId: string, @Query('search') search?: string) {
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-groups.controller.ts: listing the teams requires admin again.')
