# AN AGENT THAT COST NOTHING HAS A RETURN OF NOTHING: 0×, which says it was worth nothing.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: unit: apps/api/src/modules/ai/ai-value.test.ts "an agent that cost nothing has no return, rather than ∞ or 0"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
s = io.open(c, encoding='utf-8').read()
old = '    roi: exactCost > 0 ? Math.round((valueUsd / exactCost) * 10) / 10 : null,\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '    roi: exactCost > 0 ? Math.round((valueUsd / exactCost) * 10) / 10 : 0,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-u2-no-cost-is-no-return: an agent that cost nothing has a return of nothing')
