# THE PLANNER'S PRIORITIES RAIL NEVER SAYS WHO ADDED A TASK.
#
# `ledger-rows/row-850`. The API says who, and the rail draws the task and not
# the line under it. The owner's own view — the place they decide their day
# from — is the one place a colleague's task looks exactly like their own
# choice. The panel still says it, which is how the difference hides: whoever
# checks a colleague's panel sees it right.
#
# ONE CHECK: the teammate's own Planner.
#
# Reddens: assign-to-priorities: "in their Planner's Priorities, the task says \"Added by\" and who"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = "                    {addedByOther(p, currentUserId) && (\n"
b = "                    {false && addedByOther(p, currentUserId) && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-9-the-planner-never-says-who: the rail draws no "Added by"')
