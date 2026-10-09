# THE WORKSPACE'S GUESTS ARE LISTED AMONG ITS PEOPLE.
# (`ledger-rows/section3-team-analytics`)
# Reddens: teams-analytics: "it lists the workspace’s members and not its guest"
#   or "the Analytics tab draws a row a member — not the guest — with the member’s two task views, their Lineup and both tasks named, and the team’s roll-up"
import io
p = '/home/user/rundesk/apps/api/src/modules/team-analytics/team-analytics.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("      .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest')))\n",
     "      .where(and(eq(workspaceMembers.workspaceId, workspaceId), ne(workspaceMembers.role, 'guest') && undefined)) // BROKEN: guests listed\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tan-7-guests-counted-among-the-people: guests counted among the people')
