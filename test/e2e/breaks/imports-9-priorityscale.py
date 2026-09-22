# Check 9 — Jira's "Highest" imports as high instead of urgent.
#
# TWO LINES IN ONE FILE, AND THAT IS THE MINIMUM THAT CAN DISPROVE THE CLAIM.
#
# The first version emptied `URGENT_WORDS` in `spreadsheet-import.util.ts`, and
# it ran GREEN. `mapPriority` answered "highest" twice over on its own: an exact
# entry in `PRIORITY_BY_WORD` and a containment rule ordered ahead of `high`
# precisely so the longer word cannot be eaten by the shorter one inside it. So
# the word list this patch emptied decided nothing, which is the duplicated list
# and is now fixed in the product — those lists hold only the tokens
# `mapPriority` cannot express.
#
# With the duplication gone there is one place that decides, and it still takes
# both of its lines: removing the exact entry alone leaves the containment rule
# to catch it, and removing the containment rule alone leaves the exact entry.
# Two adjacent lines, one decision, recorded here as the minimum rather than
# passed off as a single mistake.
#
# What it produces is a priority one rung below the one the CSV asked for. No
# error, no refusal, a real value in a real column — and "Highest" is the rung
# people use for the work that cannot wait.
#
# PREDICTED ONE. The check reads Alpha's description, status, priority and due
# date in one assertion, so a patch touching any of the four reddens the same
# sentence; the failure detail is what tells them apart, and it prints all four.
#
# Reddens: imports: "Alpha carries its description, status done, priority urgent"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/clickup-csv.util.ts'
s = io.open(p, encoding='utf-8').read()
a = "  urgent: 'urgent', highest: 'urgent', critical: 'urgent', blocker: 'urgent', p0: 'urgent', '1': 'urgent',"
b = "  urgent: 'urgent', critical: 'urgent', blocker: 'urgent', p0: 'urgent', '1': 'urgent',"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
s = s.replace(a, b)
a2 = "  if (v.includes('highest')) return 'urgent'\n"
assert s.count(a2) == 1, f'second anchor occurs {s.count(a2)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a2, ''))
print("BROKE check 9: 'Highest' now imports as high rather than urgent")
