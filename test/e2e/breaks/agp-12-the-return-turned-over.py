# THE RETURN IS COST OVER VALUE: an agent worth twelve times its cost reads as a tenth.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "time saved is its actions at 6 minutes each, its value that time at $50 an hour, its cost its credits at a tenth of a cent, and its return value over cost"
#   or "the Credits tab draws My Agent Performance under the month’s credits: a row per agent with who made it, its actions, time saved, value, cost and return"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
s = io.open(c, encoding='utf-8').read()
old = '    roi: exactCost > 0 ? Math.round((valueUsd / exactCost) * 10) / 10 : null,\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '    roi: valueUsd > 0 ? Math.round((exactCost / valueUsd) * 10) / 10 : null,\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-12-the-return-turned-over: the return is cost over value')
