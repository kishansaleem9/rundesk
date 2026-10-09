# THE SECTIONS LISTED ARE EVERYBODY'S IN THE WORKSPACE.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a section is its maker’s: a colleague is listed none of theirs, reaches none of them (404) and cannot place one in their own rail (400)"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      .where(and(eq(plannerRailSections.userId, userId), eq(plannerRailSections.workspaceId, workspaceId)))\n      .orderBy(asc(plannerRailSections.createdAt), asc(plannerRailSections.id))\n',
     "      .where(eq(plannerRailSections.workspaceId, workspaceId)) // BROKEN: everybody's\n      .orderBy(asc(plannerRailSections.createdAt), asc(plannerRailSections.id))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("prs-10-the-list-is-everyones: the list is everyone's")
