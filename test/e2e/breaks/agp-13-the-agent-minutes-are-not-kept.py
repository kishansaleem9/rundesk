# EDIT BENCHMARK KEEPS NOTHING OF THE MINUTES PER ACTION: the route answers, and the column stays.
# (`found-14-oct/agent-performance-carried-and-unbuilt`)
# Reddens: agent-performance: "an admin sets the minutes an action saves and the hourly rate; each agent’s row is reckoned again from them, and the value panel’s minutes per run are its own (read by SQL)"
#   or "Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)"
import io
c = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
s = io.open(c, encoding='utf-8').read()
old = '    if (patch.minutesSavedPerAgentAction !== undefined) set.aiMinutesSavedPerAgentAction = patch.minutesSavedPerAgentAction\n'
assert s.count(old) == 1, f'anchor appears {s.count(old)} times in {c}, expected exactly 1'
s = s.replace(old, '')
io.open(c, 'w', encoding='utf-8').write(s)
print('agp-13-the-agent-minutes-are-not-kept: edit benchmark keeps nothing of the minutes per action')
