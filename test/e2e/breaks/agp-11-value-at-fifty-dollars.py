# THE VALUE IS RECKONED AT $50 AN HOUR, whatever rate the workspace set.
# (`found-14-oct/agent-performance-carried-and-unbuilt`) $50 is the default, so only a set rate shows it.
# Reddens: agent-performance: "an admin sets the minutes an action saves and the hourly rate; each agent’s row is reckoned again from them, and the value panel’s minutes per run are its own (read by SQL)"
#   or "Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai-value.ts'
s = io.open(c, encoding='utf-8').read()
old = '  const valueUsd = money((minutesSaved / 60) * (rateCents / 100))\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '  const valueUsd = money((minutesSaved / 60) * 50)\n')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-11-value-at-fifty-dollars: the value is reckoned at $50 an hour, whatever rate the workspace set.')
