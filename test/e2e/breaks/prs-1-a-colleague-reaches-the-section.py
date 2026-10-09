# A SECTION IS REACHED BY ANYBODY IN ITS WORKSPACE, not only its maker.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a section is its maker’s: a colleague is listed none of theirs, reaches none of them (404) and cannot place one in their own rail (400)"
#   or "an archived task drops off its section, and one in the trash is not put in, saying so"
#   or "deleting a section takes it off the rail and out of the order, and the task it held stays as it was"
#   or "a name past 60 characters, a blank one, and words for an emoji are refused, and nothing is made"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 7 — checks that stand on what the first ones lost.
# The colleague deletes the second section, so the checks that use it after fail with it.
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('          eq(plannerRailSections.id, sectionId),\n          eq(plannerRailSections.userId, userId),\n',
     "          eq(plannerRailSections.id, sectionId),\n          // BROKEN: anybody's section\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-1-a-colleague-reaches-the-section: a colleague reaches the section')
