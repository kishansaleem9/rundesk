# A status that the list really defines still resolves to category "open".
#
# The seeding is untouched and the pipeline is there; what goes is the
# agreement between the two columns. A task set to "done" stores
# `status = 'done'` and `statusCategory = 'open'`, which is the exact pair the
# suite's header calls the defect — "The UI renders the status the person
# picked; lists, reports, the planner, Workload and the teams work preview all
# reason on the CATEGORY. They disagreed permanently and invisibly."
#
# It is the one-word version of the original bug, moved from the empty-pipeline
# branch into the populated one, which is where it can no longer be explained
# away as a list that was never set up. A cast like `match.category as
# StatusCategory` is exactly the shape that gets replaced by a literal when
# somebody is making a type error go away.
#
# REDDENS THE TWO CHECKS WITH TEETH AND NOTHING ELSE. The key is still stored,
# so "the stored status is the key that was asked for" stays green — which is
# the point the header makes about asserting the key alone. The category check
# fails, and the work preview goes on listing the task as current work, which
# is the same fact read by an independent reader.
#
# Reddens: list-statuses-seeded: "and the stored CATEGORY says closed — the half that used to disagree"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      if (match) return { key: match.key, category: match.category as StatusCategory }"
b = "      if (match) return { key: match.key, category: 'open' as StatusCategory }"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: a matched status now resolves to category "open" whatever it means.')
