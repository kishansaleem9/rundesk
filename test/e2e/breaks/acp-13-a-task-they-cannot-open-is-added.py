# A TASK THE TEAMMATE CANNOT OPEN GOES ON THEIR PRIORITIES.
#
# `ledger-rows/row-850`. The second `readableTask` — asked as the colleague —
# goes, and the caller's own read is all that is left. So a manager can put a
# private task on a member's list: a row its owner cannot open, whose title the
# owner's read then hides (a pinned task shows only to a reader who may open
# it), so their Planner holds a priority they can neither see nor clear by
# finishing it. ClickUp draws such a task as "Private task"; the sources do not
# say it may be added, and this product took the safe rule: never written.
#
# ONE CHECK: the private task, refused with 403 and no row.
#
# Reddens: assign-to-priorities: "nor may anybody add a task the colleague cannot open (403)"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = """    if (!(await this.mayOpenTask(workspaceId, taskId, { id: userId, role: target.platformRole }))) {
      throw new ForbiddenException(
        `${target.displayName || 'That person'} cannot open this task, so it cannot go on their priorities`,
      )
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-13-a-task-they-cannot-open-is-added: the colleague\'s own read of the task is not asked')
