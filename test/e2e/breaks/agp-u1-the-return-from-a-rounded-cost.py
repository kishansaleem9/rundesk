# THE RETURN IS RECKONED FROM THE COST ROUNDED TO A CENT: three credits cost nothing, and the return is a division by zero.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: unit: apps/api/src/modules/ai/ai-value.test.ts "the return is reckoned from what the credits cost exactly, not from a cost rounded to a cent"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
s = io.open(c, encoding='utf-8').read()
old = '    roi: exactCost > 0 ? Math.round((valueUsd / exactCost) * 10) / 10 : null,\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '    roi: exactCost > 0 ? Math.round((valueUsd / money(exactCost)) * 10) / 10 : null,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-u1-the-return-from-a-rounded-cost: the return is reckoned from the cost rounded to a cent')
