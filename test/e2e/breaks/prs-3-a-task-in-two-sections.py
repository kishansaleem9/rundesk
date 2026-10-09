# PUT IN A SECOND SECTION, A TASK IS NOT TAKEN OUT OF THE FIRST.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "a task is in one of a person’s sections at a time: put in another, it moves — the first says it is empty, the second lists it"
#   or "a section is its maker’s: a colleague is listed none of theirs, reaches none of them (404) and cannot place one in their own rail (400)"
#   or "an archived task drops off its section, and one in the trash is not put in, saying so"
#
# The unique index refuses the second row, so the move answers 500 and the task stays where it was.
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      // One section at a time: from wherever else this person had put it.\n      await tx\n        .delete(plannerRailSectionTasks)\n        .where(and(eq(plannerRailSectionTasks.userId, userId), eq(plannerRailSectionTasks.taskId, taskId)))\n',
     '      // BROKEN: not taken out of the other section\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-3-a-task-in-two-sections: a task in two sections')
