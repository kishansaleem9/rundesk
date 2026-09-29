# A TASK ADDED TO A TEAMMATE'S PRIORITIES IS RECORDED AS ADDED BY THE TEAMMATE.
#
# `ledger-rows/row-850`. The colleague's write passes the owner where it should
# pass the caller, so every row a colleague adds reads as the owner's own
# choice. ClickUp's list says "Added by" for exactly this reason: a day with
# somebody else's tasks in it is a different day, and the owner is owed the
# difference. The row is written, on the right list, by the right route — and
# says nothing true about who put it there.
#
# Three checks: the API's answer, and the two places that would have named the
# assigner — the teammate's panel and their Planner — saying nothing.
#
# Reddens: assign-to-priorities:
#   "and it says who added it: the one who assigned it"
#   "the toast's link opens their priorities, where the task says who added it"
#   "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = "    return this.insertPriority(workspaceId, userId, { taskId, title: null }, caller.id)\n"
b = "    return this.insertPriority(workspaceId, userId, { taskId, title: null }, userId)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-6-the-owner-is-recorded-as-the-adder: a colleague\'s add records the owner as its adder')
