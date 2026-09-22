# The three sources averaged as percentages instead of pooled as items, so one
# ticked checklist item outweighs fifteen closed subtasks. The number still
# moves when work is done, still lands between 0 and 100, and still looks
# entirely reasonable — which is why nobody would report it.
#
# IT NAMED THE ONE CHECK THAT CANNOT SEE IT. "checklist items join the same pool
# rather than forming their own average" is asked at one closed subtask of two
# and one ticked item of two — 50% pooled, and the mean of 50 and 50 is also 50.
# The sentence is exactly right about the defect and the fixture underneath it is
# symmetric, so the two computations agree and the check passes. That is now said
# out loud beside the check itself.
#
# What this really breaks is every ASYMMETRIC count after it, where the groups
# are different sizes — five checks, and each one reports a plausible number
# rather than an error, which is the whole point of the defect.
#
# PREDICTED FIVE.
#
# Reddens: custom-field-progress: "a resolved assigned comment counts as done"
#   and "but an ordinary comment is not work, and does not move the number" and
#   "so the reported figure is still the one the work says" and
#   "dropping subtasks leaves the checklist and the comment"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/progress.ts'
a = '  return Math.round((done / total) * 100)\n'
b = """  const each = enabled.filter((t) => t.total > 0).map((t) => (t.done / t.total) * 100)
  return Math.round(each.reduce((n, x) => n + x, 0) / each.length)
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('progress.ts: the three sources are averaged, so one checklist item can outweigh fifteen subtasks.')
