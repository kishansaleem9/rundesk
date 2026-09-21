# The three sources averaged as percentages instead of pooled as items, so one
# ticked checklist item outweighs fifteen closed subtasks. The number still
# moves when work is done, still lands between 0 and 100, and still looks
# entirely reasonable — which is why nobody would report it.
#
# Reddens: custom-field-progress:
#   "checklist items join the same pool rather than forming their own average"
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
