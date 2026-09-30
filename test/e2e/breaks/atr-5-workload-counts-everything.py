# THE DEADLINE'S WORKLOAD COUNTS EVERY TASK: an assignee's load in lists the asker is refused goes to the model for them.
# Measured only in the prompt, so only where a model answers; without one the check reads the 503.
# Reddens only where a model answers: run it on a lane with RUNDESK_LANE_MODEL set for that lane.
# Reddens: ai-task-reads: "a deadline is suggested for no task its asker may not open (404 each, as for a task that is not there) — and the workload it weighs counts, for a member, only the tasks they may open: one of the busy member’s three, where the admin’s counts all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "          sql`${tasks.statusCategory} <> 'closed'`,\n          readerSees,\n"
b = "          sql`${tasks.statusCategory} <> 'closed'`,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-5-workload-counts-everything: the workload counts every task')
