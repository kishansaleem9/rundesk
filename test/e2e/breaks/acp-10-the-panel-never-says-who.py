# THE PERSON PANEL'S PRIORITIES NEVER SAY WHO ADDED A TASK.
#
# `ledger-rows/row-850`. The panel draws each priority's title and drops the
# line under it, so the teammate's panel — where the toast's "Open Priorities"
# lands — shows the task you just added and not that you added it. The rail in
# their Planner still says it.
#
# ONE CHECK: the panel the toast opens, read for the row it added.
#
# Reddens: assign-to-priorities: "the toast's link opens their priorities, where the task says who added it"
import io
p = '/home/user/rundesk/apps/web/src/components/person-panel.tsx'
a = "            {addedByOther(p, userId) && (\n"
b = "            {false && addedByOther(p, userId) && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-10-the-panel-never-says-who: the panel draws no "Added by"')
