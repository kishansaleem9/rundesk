# The cards still change; the REASON they changed stops being reported. `because` is
# the only thing that makes "the set moved" attributable rather than merely visible —
# without it, a set rotating on a timer looks identical from outside.
# Reddens: ai-answer-rendering: "Find Blockers now names exactly two more overdue tasks than before"
#          unit: ai-starters.test.ts "names the fact AND the number that put each card there"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-starters.ts'
a = "    when: (f) => (f.overdue > 0 ? `overdue:${f.overdue}` : null),"
b = "    when: (f) => (f.overdue > 0 ? 'overdue' : null),"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-starters.ts: the Find Blockers card no longer says how many are overdue.')
